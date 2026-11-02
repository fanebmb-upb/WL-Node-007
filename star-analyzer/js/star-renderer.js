/* ════════════════════════════════════════
   STAR RENDERER — Three.js
   One WebGLRenderer per stage, reused across star selections. Star looks are
   driven by visualParams() (js/star-visuals.js); see the [physics]/[art] notes
   there and in the shaders below.
════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { blackbodyRGB } from './physics.js';

const MAX_DPR = 2;
const BASE_PX = 68;        // largest log-scaled radius in px (v3 renderer)
const MAX_WORLD_R = 0.78;  // world radius that BASE_PX maps to

/* ── Shared GLSL ─────────────────────────────────────────────────── */
const NOISE_GLSL = /* glsl */`
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise(vec3 p) {               // value noise, smooth
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash33(i).x, n100 = hash33(i + vec3(1,0,0)).x, n010 = hash33(i + vec3(0,1,0)).x, n110 = hash33(i + vec3(1,1,0)).x;
  float n001 = hash33(i + vec3(0,0,1)).x, n101 = hash33(i + vec3(1,0,1)).x, n011 = hash33(i + vec3(0,1,1)).x, n111 = hash33(i + vec3(1,1,1)).x;
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
// Cellular (Worley) noise with slowly drifting feature points → boiling cells
vec2 worley(vec3 x, float t) {
  vec3 ip = floor(x), fp = fract(x);
  float F1 = 8.0, F2 = 8.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 b = vec3(float(i), float(j), float(k));
    vec3 h = hash33(ip + b);
    vec3 o = 0.5 + 0.42 * sin(t * (0.35 + 0.4 * h) + 6.2831 * h);
    vec3 r = b + o - fp;
    float d = dot(r, r);
    if (d < F1) { F2 = F1; F1 = d; } else if (d < F2) { F2 = d; }
  }
  return sqrt(vec2(F1, F2));
}
`;

// Blackbody colour ramp (log T from 1,000 to 40,000 K) for the accretion disk
const RAMP_T_MIN = 1000, RAMP_T_MAX = 40000;
function makeBlackbodyRamp() {
  const N = 256, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const T = RAMP_T_MIN * Math.pow(RAMP_T_MAX / RAMP_T_MIN, i / (N - 1));
    const [r, g, b] = blackbodyRGB(T);   // linear
    data.set([r * 255, g * 255, b * 255, 255].map(Math.round), i * 4);
  }
  const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
const RAMP_GLSL = /* glsl */`
uniform sampler2D uRamp;
vec3 bbColor(float T) {
  float x = clamp(log(T / ${RAMP_T_MIN.toFixed(1)}) / log(${(RAMP_T_MAX / RAMP_T_MIN).toFixed(1)}), 0.0, 1.0);
  return texture2D(uRamp, vec2(x, 0.5)).rgb;
}
`;

/* ── Photosphere ─────────────────────────────────────────────────── */
const SURFACE_VERT = /* glsl */`
uniform float uTime, uIrregular, uSeed;
varying vec3 vObj, vNormalV, vViewV;
${NOISE_GLSL}
void main() {
  vObj = normalize(position);
  vec3 p = position;
  // [art] giants: lumpy, extended limb from a few large convective plumes
  if (uIrregular > 0.0) {
    float n = fbm(vObj * 1.6 + uSeed * 10.0 + uTime * 0.015) - 0.5;
    p += normal * n * 0.09 * uIrregular * length(position);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const SURFACE_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uTime, uLimbU, uGranAmp, uGranFreq, uGiant, uSpots, uCore, uSeed, uFlare;
uniform vec3 uFlareDir;
varying vec3 vObj, vNormalV, vViewV;
${NOISE_GLSL}
void main() {
  float mu = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
  // [physics] linear limb darkening I(μ) = 1 − u(1 − μ). Darkening is stronger at
  // shorter wavelengths, so the per-channel u makes the limb redder than the centre.
  vec3 u3 = min(vec3(0.95), uLimbU * vec3(0.80, 1.0, 1.22));
  vec3 limb = 1.0 - u3 * (1.0 - mu);

  vec3 p = vObj + uSeed * 7.0;
  float surf = 1.0;
  if (uGranAmp > 0.0) {
    // [art, physically scaled] granulation: bright cells, dark intergranular lanes
    vec3 q = p * uGranFreq;
    // domain warp so cells are irregular blobs rather than a Voronoi tiling
    q += (vec3(fbm(q * 0.6), fbm(q * 0.6 + 5.2), fbm(q * 0.6 + 9.7)) - 0.5) * mix(0.6, 1.4, uGiant);
    vec2 w = worley(q, uTime * (0.6 - 0.45 * uGiant));
    float lane = smoothstep(0.0, mix(0.32, 0.9, uGiant), w.y - w.x);
    float cell = mix(0.62, 1.06, lane) * (1.0 - mix(0.18, 0.5, uGiant) * w.x * w.x);
    float mottle = 0.85 + 0.3 * fbm(p * uGranFreq * 2.3 + uTime * 0.05);
    float contrast = mix(0.55, 1.0, uGiant);           // supergiant cells are high-contrast
    surf = mix(1.0, cell * mottle, uGranAmp * contrast);
    // giants: extra large-scale brightness patches (hot plumes)
    surf *= mix(1.0, 0.7 + 0.6 * fbm(p * 1.3 + uTime * 0.01), uGiant * uGranAmp);
  } else {
    surf = 0.97 + 0.06 * fbm(p * 6.0 + uTime * 0.02);  // radiative envelope: smooth
  }

  vec3 col = uColor * 0.93 * mix(1.0, uCore, mu * mu) * limb * surf;

  if (uSpots > 0.0) {
    // [art] magnetic starspots: dark, slightly cooler (redder) umbra + penumbra
    float n = fbm(p * 2.2 + 3.1);
    float pen = smoothstep(0.60, 0.66, n) * uSpots;
    float umb = smoothstep(0.66, 0.71, n) * uSpots;
    col *= 1.0 - 0.45 * pen - 0.35 * umb;
    col *= mix(vec3(1.0), vec3(1.0, 0.82, 0.7), pen);
  }
  if (uFlare > 0.0) {
    float a = acos(clamp(dot(vObj, uFlareDir), -1.0, 1.0));
    col += vec3(1.0, 0.97, 1.08) * uFlare * 2.2 * exp(-a * a / 0.012);
  }
  float alpha = mix(1.0, smoothstep(0.0, 0.22, mu), uGiant);  // softer limb for giants
  gl_FragColor = vec4(col, alpha);
}`;

/* ── Billboards: glow halo, mass-loss haze ───────────────────────── */
const BILLBOARD_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const HALO_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uR, uStrength, uFalloff, uTime, uRays;
varying vec2 vP;
${NOISE_GLSL}
void main() {
  float rr = length(vP) / uR;               // distance in stellar radii
  if (rr < 0.9) discard;
  float x = max(rr - 1.0, 0.0);
  float g = exp(-x * uFalloff) * (1.0 - smoothstep(0.0, 1.0, x / 6.0));
  float ang = atan(vP.y, vP.x);
  float rays = 1.0 + uRays * (vnoise(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uTime * 0.05)) - 0.5);
  vec3 c = mix(uColor, vec3(1.0), 0.25) * g * uStrength * rays;
  gl_FragColor = vec4(c, 1.0);
}`;

const HAZE_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uR, uStrength, uTime, uSeed;
varying vec2 vP;
${NOISE_GLSL}
void main() {
  float rr = length(vP) / uR;
  if (rr < 0.85) discard;
  float ang = atan(vP.y, vP.x);
  vec3 q = vec3(cos(ang) * 1.6, sin(ang) * 1.6, rr * 1.4 - uTime * 0.02 + uSeed * 9.0);
  float wisps = smoothstep(0.35, 0.85, fbm(q));
  float fall = smoothstep(2.4, 1.0, rr) * smoothstep(0.85, 1.1, rr);
  vec3 c = uColor * vec3(1.0, 0.72, 0.55) * wisps * fall * uStrength;   // dusty, reddened
  gl_FragColor = vec4(c, 1.0);
}`;

/* ── Pulsar beams ────────────────────────────────────────────────── */
const BEAM_VERT = /* glsl */`
varying float vAlong; varying vec3 vN, vV;
void main() {
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uStrength;
varying float vAlong; varying vec3 vN, vV;
void main() {
  float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
  float len = smoothstep(0.0, 0.15, vAlong) * pow(vAlong, 1.2);   // fades away from the star (uv.y=1 at apex)
  gl_FragColor = vec4(uColor * core * len * uStrength, 1.0);
}`;

/* ── Black hole: accretion disk ──────────────────────────────────── */
const DISK_VERT = /* glsl */`
varying vec3 vLocal, vWorld, vCenter;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DISK_FRAG = /* glsl */`
uniform float uTime, uRs, uIn, uOut, uTin;
uniform vec3 uNormalW;
varying vec3 vLocal, vWorld, vCenter;
${NOISE_GLSL}
${RAMP_GLSL}
void main() {
  vec2 q = vLocal.xy;                    // ring geometry lies in its local XY plane
  float r = length(q);
  float phi = atan(q.y, q.x);
  float x = r / uIn;
  // [physics, shape] thin-disk temperature profile T ∝ r^-3/4 (1 − √(r_in/r))^1/4,
  // normalised so the hottest annulus reaches uTin
  float prof = pow(x, -0.75) * pow(max(1.0 - sqrt(1.0 / x), 0.0), 0.25) / 0.488;
  float T = uTin * prof;
  // [physics, approx.] relativistic Doppler + gravitational shift for circular orbits:
  // g = √(1 − 1.5 rₛ/r) / (1 − β cosθ),  β = √(rₛ / 2(r − rₛ))
  vec3 rhat = normalize(vWorld - vCenter);
  vec3 vdir = normalize(cross(uNormalW, rhat));
  vec3 toCam = normalize(cameraPosition - vWorld);
  float rRs = r / uRs;
  float beta = sqrt(1.0 / (2.0 * max(rRs - 1.0, 0.5)));
  float gfac = sqrt(max(1.0 - 1.5 / rRs, 0.02)) / (1.0 - beta * dot(vdir, toCam));
  // [art] turbulent streaks sheared by differential (Keplerian) rotation ω ∝ r^-3/2
  float omega = 0.9 * pow(x, -1.5);
  float ph = phi - uTime * omega;
  float streak = 0.45 + 1.0 * fbm(vec3(cos(ph) * 3.0, sin(ph) * 3.0, log(r) * 4.0));
  float I = min(pow(prof, 2.0) * pow(gfac, 3.0) * streak, 2.2);   // beaming ∝ g³
  float edge = smoothstep(uIn, uIn * 1.08, r) * (1.0 - smoothstep(uOut * 0.55, uOut, r));
  vec3 col = bbColor(T * gfac) * I * edge * 0.8;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ── Black hole: photon ring + lensed far side of the disk (faked) ─ */
const LENS_FRAG = /* glsl */`
uniform float uTime, uRsh, uIn, uOut, uTin, uEdgeOn, uBeta;
uniform vec2 uArcDir, uApproach;
varying vec2 vP;
${NOISE_GLSL}
${RAMP_GLSL}
void main() {
  float rho = length(vP);
  if (rho < uRsh * 0.98) discard;
  vec2 dir = vP / rho;
  float side = dot(dir, uArcDir);
  // Doppler asymmetry carried into the lensed image: the side of the approaching limb is brighter
  float cosT = dot(dir, uApproach) * uEdgeOn;
  float gfac = 0.8 / (1.0 - uBeta * cosT);
  // Photon ring: light that orbited the photon sphere, just outside the shadow
  float ring = exp(-pow((rho - uRsh * 1.01) / (uRsh * 0.009), 2.0));
  // Primary lensed image of the far side: an arc hugging the shadow on the far side,
  // a fainter secondary image on the opposite side. Face-on it closes into a ring.
  float band = uRsh * 0.55;
  float t1 = (rho - uRsh * 1.04) / band;
  float primary = smoothstep(0.0, 0.06, t1) * (1.0 - smoothstep(0.08, 1.0, t1));
  float wPrimary = mix(1.0, smoothstep(-0.15, 0.9, side), uEdgeOn);
  float t2 = (rho - uRsh * 1.03) / (band * 0.3);
  float secondary = smoothstep(0.0, 0.1, t2) * (1.0 - smoothstep(0.3, 1.0, t2));
  float wSecondary = mix(0.0, smoothstep(0.1, -0.9, side), uEdgeOn) * 0.45;
  float rDisk = mix(uIn, uOut * 0.6, clamp(t1, 0.0, 1.0));
  float xd = rDisk / uIn;
  float prof = pow(xd, -0.75) * pow(max(1.0 - sqrt(1.0 / xd), 0.0), 0.25) / 0.488;
  float ang = atan(dir.y, dir.x);
  float streak = 0.5 + 0.9 * fbm(vec3(cos(ang - uTime * 0.5) * 3.0, sin(ang - uTime * 0.5) * 3.0, log(rDisk) * 4.0));
  float I = min((primary * wPrimary + secondary * wSecondary) * (0.3 + prof) * streak * pow(gfac, 3.0) * 0.75, 2.0);
  vec3 col = bbColor(uTin * prof * gfac) * I + bbColor(uTin * 1.2 * gfac) * ring * 0.45 * pow(gfac, 2.0);
  gl_FragColor = vec4(col, 1.0);
}`;

/* ── Helpers ─────────────────────────────────────────────────────── */
function additive(uniforms, vertexShader, fragmentShader, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...extra,
  });
}

function dashedCircle(radius, color = 0xff4455, opacity = 0.55) {
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({
    color, transparent: true, opacity, dashSize: radius * 0.09, gapSize: radius * 0.12,
    depthTest: false, depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  line.renderOrder = 10;
  return line;
}

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const camRight = new THREE.Vector3(), camUp = new THREE.Vector3();

/* ── StarRig: one object (star / remnant / black hole) ───────────── */
class StarRig extends THREE.Group {
  constructor(vp, ctx) {
    super();
    this.kind = vp.kind;
    this.ctx = ctx;
    this.billboards = [];
    this.flareState = { value: 0, next: 2 + Math.random() * 4 };
    if (vp.kind === 'blackhole') this.buildBlackHole(vp);
    else this.buildStar(vp);
    this.apply(vp);
  }

  buildStar(vp) {
    const compact = vp.kind !== 'star';
    this.surfaceU = {
      uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uLimbU: { value: 0.6 },
      uGranAmp: { value: 0 }, uGranFreq: { value: 20 }, uGiant: { value: 0 }, uSpots: { value: 0 },
      uCore: { value: 1 }, uSeed: { value: 0 }, uFlare: { value: 0 }, uFlareDir: { value: new THREE.Vector3(0, 1, 0) },
      uIrregular: { value: 0 },
    };
    const seg = compact ? 48 : 160;
    this.surface = new THREE.Mesh(
      new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)),
      new THREE.ShaderMaterial({ uniforms: this.surfaceU, vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG, transparent: true }),
    );
    this.surface.rotation.z = 0.25;          // axial tilt
    this.add(this.surface);

    this.haloU = { uColor: { value: new THREE.Color() }, uR: { value: 1 }, uStrength: { value: 1 }, uFalloff: { value: 3 }, uTime: { value: 0 }, uRays: { value: 0.3 } };
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.haloU, BILLBOARD_VERT, HALO_FRAG));
    this.halo.renderOrder = -1;
    this.add(this.halo); this.billboards.push(this.halo);

    this.hazeU = { uColor: { value: new THREE.Color() }, uR: { value: 1 }, uStrength: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 } };
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.hazeU, BILLBOARD_VERT, HAZE_FRAG));
    this.haze.renderOrder = -2;
    this.add(this.haze); this.billboards.push(this.haze);

    if (vp.kind === 'neutron') {
      // Two beams along a magnetic axis inclined to the spin axis (lighthouse effect)
      this.beamU = { uColor: { value: new THREE.Color(0.75, 0.85, 1.0) }, uStrength: { value: 0.9 } };
      this.spinner = new THREE.Group();
      const mag = new THREE.Group();
      mag.rotation.z = 0.6;                   // magnetic inclination ≈ 35°
      const beamGeo = new THREE.ConeGeometry(0.42, 3.2, 40, 1, true);
      beamGeo.translate(0, -1.6, 0);          // apex at the star, opening outward along −y
      for (const s of [1, -1]) {
        const beam = new THREE.Mesh(beamGeo, additive(this.beamU, BEAM_VERT, BEAM_FRAG, { side: THREE.DoubleSide }));
        if (s < 0) beam.rotation.z = Math.PI;
        mag.add(beam);
      }
      this.spinner.add(mag);
      this.magAxis = mag;
      this.add(this.spinner);
    }

    this.schwRing = null;
  }

  buildBlackHole() {
    // Display units: shadow radius = √27/2 rₛ ≈ 2.6 rₛ; disk from the ISCO (3 rₛ) outward
    const rsh = 0.42, rs = rsh / 2.598, rin = 3 * rs, rout = 9.5 * rs;
    this.bh = { rsh, rs, rin, rout };
    const ramp = this.ctx.ramp;

    this.shadow = new THREE.Mesh(new THREE.SphereGeometry(rsh, 64, 48), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.add(this.shadow);

    this.diskGroup = new THREE.Group();
    this.diskGroup.rotation.z = 0.12;                         // slight tilt for drama
    this.diskU = {
      uTime: { value: 0 }, uRs: { value: rs }, uIn: { value: rin }, uOut: { value: rout }, uTin: { value: 4600 },
      uNormalW: { value: new THREE.Vector3(0, 1, 0) }, uRamp: { value: ramp },
    };
    const disk = new THREE.Mesh(new THREE.RingGeometry(rin, rout, 256, 12),
      additive(this.diskU, DISK_VERT, DISK_FRAG, { side: THREE.DoubleSide }));
    disk.rotation.x = -Math.PI / 2;                            // into the XZ plane, normal +Y
    this.disk = disk;
    this.diskGroup.add(disk);
    this.add(this.diskGroup);

    this.lensU = {
      uTime: { value: 0 }, uRsh: { value: rsh }, uIn: { value: rin }, uOut: { value: rout }, uTin: { value: 4600 },
      uEdgeOn: { value: 1 }, uBeta: { value: 0.4 }, uArcDir: { value: new THREE.Vector2(0, 1) },
      uApproach: { value: new THREE.Vector2(1, 0) }, uRamp: { value: ramp },
    };
    this.lens = new THREE.Mesh(new THREE.PlaneGeometry(rout * 2.4, rout * 2.4), additive(this.lensU, BILLBOARD_VERT, LENS_FRAG));
    this.add(this.lens); this.billboards.push(this.lens);

    this.horizon = dashedCircle(rs, 0xff4455, 0.75);   // Schwarzschild radius hint
    this.add(this.horizon); this.billboards.push(this.horizon);
  }

  apply(vp) {
    this.vp = vp;
    if (this.kind === 'blackhole') return;
    const r = Math.max(vp.screenPx / BASE_PX * MAX_WORLD_R, 0.02);
    this.radius = r;
    this.surface.scale.setScalar(r);
    const U = this.surfaceU;
    U.uColor.value.setRGB(...vp.color);                 // linear sRGB (CIE-integrated)
    U.uLimbU.value = vp.limbU;
    U.uGranAmp.value = vp.granAmp;
    U.uGranFreq.value = vp.granCells / 2;               // cells per unit radius
    U.uGiant.value = vp.giant;
    U.uSpots.value = vp.spots;
    U.uCore.value = vp.core;
    U.uSeed.value = vp.seed;
    U.uIrregular.value = vp.irregular;

    // Glow: compact remnants get a tight, sharp halo; luminous stars a wide one
    const compact = vp.kind !== 'star';
    const H = this.haloU;
    H.uColor.value.setRGB(...vp.color);
    H.uStrength.value = vp.glow * (compact ? 1.0 : 0.45);
    H.uFalloff.value = compact ? 2.6 : 3.4 - 1.2 * Math.min(vp.glow, 1);
    H.uRays.value = compact ? 0.15 : 0.35;
    const haloSpan = compact ? 9 : 7;
    this.halo.scale.setScalar(r * haloSpan * 2);
    H.uR.value = 1 / (haloSpan * 2);

    this.hazeU.uColor.value.setRGB(...vp.color);
    this.hazeU.uStrength.value = vp.haze * 0.35 * (vp.T > 7500 ? 0.35 : 1);
    this.hazeU.uSeed.value = vp.seed;
    this.haze.visible = vp.haze > 0.01;
    this.haze.scale.setScalar(r * 5);
    this.hazeU.uR.value = 1 / 5;

    if (this.magAxis) this.magAxis.scale.setScalar(Math.max(r * 2.2, 0.35));

    // Schwarzschild radius ring (only when it would be visible, as in v3)
    const sr = vp.schwRatio * r;
    if (this.schwRing) { this.remove(this.schwRing); disposeObject(this.schwRing); this.schwRing = null; }
    if (vp.schwRatio * vp.screenPx > 0.5) {
      this.schwRing = dashedCircle(Math.max(sr, 0.012));
      this.add(this.schwRing); this.billboards.push(this.schwRing);
    }
  }

  update(dt, time, camera, motion) {
    // Billboards face the camera (in the rig's parent frame)
    camera.getWorldQuaternion(tmpQ);
    for (const b of this.billboards) b.quaternion.copy(tmpQ);

    if (this.kind === 'blackhole') return this.updateBlackHole(time, camera);

    const vp = this.vp;
    if (motion) this.surface.rotation.y += dt * vp.rotSpeed;
    this.surfaceU.uTime.value = time;
    this.haloU.uTime.value = time;
    this.hazeU.uTime.value = time;

    // [art] random M-dwarf flares: fast rise, ~1.5 s decay
    const fs = this.flareState;
    if (vp.flares && motion) {
      fs.next -= dt;
      if (fs.next <= 0) {
        fs.value = 1;
        fs.next = 4 + Math.random() * 9;
        this.surfaceU.uFlareDir.value.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        // keep it on the visible hemisphere (in surface-local coordinates)
        tmpV.copy(camera.position).applyQuaternion(this.surface.getWorldQuaternion(tmpQ).invert()).normalize();
        if (this.surfaceU.uFlareDir.value.dot(tmpV) < 0.3) this.surfaceU.uFlareDir.value.lerp(tmpV, 0.7).normalize();
      }
      fs.value *= Math.exp(-dt / 0.6);
    } else {
      fs.value = 0;
    }
    this.surfaceU.uFlare.value = fs.value;
    this.haloU.uStrength.value = vp.glow * (vp.kind === 'star' ? 0.45 : 1.0) * (1 + 1.5 * fs.value);

    if (this.spinner) {
      if (motion) this.spinner.rotation.y += dt * vp.rotSpeed;
      // Pulse when a beam sweeps across the line of sight
      if (motion) {
        tmpV.set(0, 1, 0).applyQuaternion(this.magAxis.getWorldQuaternion(tmpQ));
        tmpV2.copy(camera.position).sub(this.getWorldPosition(new THREE.Vector3())).normalize();
        const pulse = Math.pow(Math.abs(tmpV.dot(tmpV2)), 12);
        this.haloU.uStrength.value *= 1 + 2.5 * pulse;
      }
    }
  }

  updateBlackHole(time, camera) {
    this.diskU.uTime.value = time;
    this.lensU.uTime.value = time;
    const n = tmpV.set(0, 1, 0).applyQuaternion(this.diskGroup.getWorldQuaternion(tmpQ)).normalize();
    this.diskU.uNormalW.value.copy(n);
    const c = tmpV2.copy(camera.position).sub(this.getWorldPosition(new THREE.Vector3())).normalize();
    const cn = n.dot(c);
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    // Far side of the disk appears on the side the disk normal projects to (flipped from below)
    const sgn = cn >= 0 ? 1 : -1;
    const ax = n.dot(camRight) * sgn, ay = n.dot(camUp) * sgn;
    const al = Math.hypot(ax, ay) || 1;
    this.lensU.uArcDir.value.set(ax / al, ay / al);
    this.lensU.uEdgeOn.value = Math.sqrt(Math.max(0, 1 - cn * cn));
    // Approaching limb: in-plane direction where the prograde velocity n × r̂ points at the camera
    const app = new THREE.Vector3().crossVectors(c, n);
    const px = app.dot(camRight), py = app.dot(camUp), pl = Math.hypot(px, py) || 1;
    this.lensU.uApproach.value.set(px / pl, py / pl);
  }

  dispose() { disposeObject(this); }
}

function disposeObject(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}

/* ── StarStage: renderer + scene + camera + controls + bloom ─────── */
export class StarStage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ reducedMotion?: boolean, onContextLost?: () => void, spacing?: number }} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.reducedMotion = !!opts.reducedMotion;
    this.spacing = opts.spacing ?? 1.9;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    this.homePos = new THREE.Vector3(0, 0.35, 4.6);
    this.camera.position.copy(this.homePos);

    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: !this.reducedMotion, dampingFactor: 0.08, enablePan: false,
      minDistance: 1.4, maxDistance: 12, rotateSpeed: 0.6, zoomSpeed: 0.7,
    });
    this.controls.addEventListener('change', () => { if (!this.running) this.renderOnce(); });

    this.ctx = { ramp: makeBlackbodyRamp() };
    this.scene.add(makeBackdrop());
    this.rigs = [];

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    this.time = 7.3;              // fixed phase for the reduced-motion still frame
    this.inView = false;
    this.running = false;
    this.disposed = false;

    this.io = new IntersectionObserver(es => { this.inView = es[es.length - 1].isIntersecting; this.updateLoop(); });
    this.io.observe(canvas);
    this.onVis = () => this.updateLoop();
    document.addEventListener('visibilitychange', this.onVis);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement || canvas);
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.stop();
      opts.onContextLost?.();
    });
    this.resize();
  }

  /** Show one or more objects (side by side). Reuses rigs when only parameters change. */
  setStars(list) {
    const sameKinds = list.length === this.rigs.length && list.every((vp, i) => vp.kind === this.rigs[i].kind);
    if (sameKinds) {
      list.forEach((vp, i) => this.rigs[i].apply(vp));
    } else {
      this.rigs.forEach(r => { this.scene.remove(r); r.dispose(); });
      this.rigs = list.map(vp => new StarRig(vp, this.ctx));
      this.rigs.forEach((r, i) => {
        r.position.x = (i - (list.length - 1) / 2) * this.spacing;
        this.scene.add(r);
      });
      if (list.length !== this.lastCount) { this.lastCount = list.length; this.resetView(); }
      this.resize();
    }
    // Bloom scales with the (brightest) object's luminosity-derived glow
    const glow = list.length ? Math.max(...list.map(v => v.kind === 'blackhole' ? 0.8 : v.glow)) : 0.5;
    this.bloom.strength = 0.25 + 0.5 * glow;
    this.renderOnce();
  }

  resetView() {
    this.camera.position.copy(this.homePos).multiplyScalar(this.rigs.length > 1 ? 1.35 : 1);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.renderOnce();
  }

  resize() {
    if (this.disposed) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Widen the vertical FOV on narrow canvases so the objects still fit horizontally
    const halfSpanX = this.rigs.length > 1 ? 2.2 + this.spacing / 2 : 1.6;
    const dist = this.homePos.length() * (this.rigs.length > 1 ? 1.35 : 1);
    const halfV = Math.atan(halfSpanX / dist / this.camera.aspect);
    this.camera.fov = Math.max(32, THREE.MathUtils.radToDeg(2 * halfV));
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  updateLoop() {
    const want = this.inView && !document.hidden && !this.reducedMotion && !this.disposed;
    if (want && !this.running) {
      this.running = true;
      this.clock.getDelta();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!want) {
      this.stop();
    }
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  tick = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    this.frame(dt, true);
    this.raf = requestAnimationFrame(this.tick);
  };

  frame(dt, motion) {
    this.controls.update();
    for (const r of this.rigs) r.update(dt, this.time, this.camera, motion);
    this.composer.render(dt);
  }

  renderOnce() {
    // controls.update() inside frame() can emit 'change', which calls back here
    if (this.disposed || this.running || this.rendering) return;
    this.rendering = true;
    try { this.frame(0, false); } finally { this.rendering = false; }
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.io.disconnect(); this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.rigs.forEach(r => r.dispose());
    this.controls.dispose();
    this.composer.dispose?.();
    this.ctx.ramp.dispose();
    this.renderer.dispose();
  }
}

// Faint deterministic background stars (decorative)
function makeBackdrop() {
  const N = 700, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * 60, u * 60, Math.sin(a) * s * 60], i * 3);
    const [r, g, b] = blackbodyRGB(2800 + rnd() * 14000);
    const k = 0.08 + 0.22 * rnd() * rnd();
    col.set([r * k, g * k, b * k], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
}
