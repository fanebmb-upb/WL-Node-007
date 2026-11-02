/* ════════════════════════════════════════
   PHYSICS — ported from C++ v2 (star.cpp)
   Pure functions only: no DOM access, so this module runs under `node --test`.
════════════════════════════════════════ */
export const PI = Math.PI;
export const SIGMA    = 5.670374419e-8;    // Stefan–Boltzmann constant, W·m⁻²·K⁻⁴ (CODATA 2018, exact)
export const B_WIEN   = 2.897771955e-3;    // Wien displacement constant, m·K (CODATA 2018)
export const C_LIGHT  = 2.99792458e8;      // speed of light, m/s (exact)
export const G_N      = 6.67430e-11;       // Newtonian gravitational constant (CODATA 2018)
export const H_PLANCK = 6.62607015e-34;    // Planck constant, J·s (exact)
export const K_B      = 1.380649e-23;      // Boltzmann constant, J/K (exact)
export const SOLAR_MASS = 1.98892e30;      // kg
export const SOLAR_L  = 3.828e26;          // W (IAU 2015 nominal)
export const SOLAR_R  = 6.957e8;           // m (IAU 2015 nominal)
export const SOLAR_T  = 5772;              // K (IAU 2015 nominal effective temperature)
export const EARTH_R  = 6.3781e6;          // m (IAU 2015 nominal equatorial)
export const PARSEC   = 3.0856775814913673e16; // m
export const AU       = 1.495978707e11;    // m
export const LIGHT_YEAR = 9.4607304725808e15; // m (Julian year)

// Planck's law: spectral radiance B_λ(λ,T) in W·sr⁻¹·m⁻³
export function planck(lam, T) {
  const x = H_PLANCK * C_LIGHT / (lam * K_B * T);
  if (x > 700) return 0; // underflow guard
  return (2 * H_PLANCK * C_LIGHT * C_LIGHT) / Math.pow(lam, 5) / Math.expm1(x);
}

// Morgan–Keenan spectral class from effective temperature
export function spectralClass(T) {
  const bands = [
    ['O', 30000, 60000], ['B', 10000, 30000], ['A', 7500, 10000],
    ['F', 6000, 7500], ['G', 5200, 6000], ['K', 3700, 5200], ['M', 2400, 3700]
  ];
  if (T >= 60000) return 'O0';
  if (T < 2400) return T >= 1300 ? 'L (brown dwarf)' : T >= 600 ? 'T (brown dwarf)' : 'Y (sub-stellar)';
  for (const [cls, lo, hi] of bands) {
    if (T >= lo && T < hi) {
      const sub = Math.min(9, Math.max(0, Math.floor(((hi - T) / (hi - lo)) * 10)));
      return cls + sub;
    }
  }
  return '—';
}

/* ── Blackbody colour ──────────────────────────────────────────────
   Integrate Planck B_λ against the CIE 1931 2° colour-matching functions,
   using the multi-lobe Gaussian fit of Wyman, Sloan & Shirley (2013),
   "Simple Analytic Approximations to the CIE XYZ Color Matching Functions",
   JCGT 2(2). Then XYZ → linear sRGB (IEC 61966-2-1, D65), normalise the
   brightest channel to 1, and apply the sRGB transfer curve.            */
function g(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
export function cieXYZ(nm) {
  return [
    1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2),
    0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1),
    1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8),
  ];
}

const COLOR_T_MIN = 1000, COLOR_T_MAX = 40000;

// Linear sRGB triple in [0,1] with the brightest channel = 1
export function blackbodyRGB(T) {
  // Above ~40,000 K the visible band is deep in the Rayleigh–Jeans tail and the
  // chromaticity has converged; below 1,000 K almost nothing is emitted in the visible.
  const Tc = Math.max(COLOR_T_MIN, Math.min(COLOR_T_MAX, Number.isFinite(T) ? T : SOLAR_T));
  let X = 0, Y = 0, Z = 0;
  for (let nm = 380; nm <= 780; nm += 5) {
    const B = planck(nm * 1e-9, Tc);
    const [x, y, z] = cieXYZ(nm);
    X += B * x; Y += B * y; Z += B * z;
  }
  let r =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  let gg = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  let b =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  // Out-of-gamut (negative) channel: desaturate towards white rather than clip hue
  const lo = Math.min(r, gg, b);
  if (lo < 0) { r -= lo; gg -= lo; b -= lo; }
  const hi = Math.max(r, gg, b) || 1;
  return [r / hi, gg / hi, b / hi];
}

export function srgbEncode(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// Effective temperature → display hex (signature unchanged from v3)
export function kelvinToHex(T) {
  return rgbHex(...blackbodyRGB(T).map(v => Math.round(255 * srgbEncode(Math.max(0, Math.min(1, v))))));
}

// Visible wavelength (nm) → [r,g,b] (Bruton's algorithm with edge falloff)
export function waveRGB(w) {
  let r = 0, g = 0, b = 0;
  if      (w >= 380 && w < 440) { r = -(w - 440) / 60; b = 1; }
  else if (w < 490)             { g = (w - 440) / 50;  b = 1; }
  else if (w < 510)             { g = 1; b = -(w - 510) / 20; }
  else if (w < 580)             { r = (w - 510) / 70;  g = 1; }
  else if (w < 645)             { r = 1; g = -(w - 645) / 65; }
  else if (w <= 780)            { r = 1; }
  let f = 1;
  if (w >= 380 && w < 420)      f = 0.3 + 0.7 * (w - 380) / 40;
  else if (w > 700 && w <= 780) f = 0.3 + 0.7 * (780 - w) / 80;
  const c = v => Math.round(255 * Math.pow(Math.max(v * f, 0), 0.8));
  return [c(r), c(g), c(b)];
}
export function rgbHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function analyzeStar(s) {
  s.L = 4 * PI * s.R * s.R * SIGMA * Math.pow(s.T, 4);
  s.lambda = B_WIEN / s.T;
  s.F = s.L / (4 * PI * s.d * s.d);
  s.P = s.F / C_LIGHT;
  s.schw_R = (2 * G_N * (s.i_mass * SOLAR_MASS)) / (C_LIGHT * C_LIGHT);

  if (s.R <= s.schw_R) {
    s.redshift_F = 0; s.redshift_T = 0;
    s.status = 'Black hole — no escape';
  } else {
    s.redshift_F = Math.sqrt(1.0 - (s.schw_R / s.R));
    s.redshift_T = s.T * s.redshift_F;
    s.status = s.redshift_F > 0.01
      ? 'Photon escapes — redshifted'
      : 'Extreme redshift — barely escapes';
  }

  // Derived observables (v3)
  s.spec  = spectralClass(s.T);
  s.bb    = kelvinToHex(s.T);
  s.M_bol = 4.74 - 2.5 * Math.log10(s.L / SOLAR_L);          // IAU 2015 zero point
  s.m_bol = s.M_bol + 5 * Math.log10(Math.max(s.d / PARSEC, 1e-12) / 10);
  s.logg  = Math.log10((G_N * s.i_mass * SOLAR_MASS / (s.R * s.R)) * 100); // cgs, log₁₀(cm/s²)
  s.v_esc = Math.sqrt(2 * G_N * s.i_mass * SOLAR_MASS / s.R); // m/s
  s.hz_in  = 0.95 * Math.sqrt(s.L / SOLAR_L);  // AU — conservative habitable zone (Kasting/Kopparapu)
  s.hz_out = 1.37 * Math.sqrt(s.L / SOLAR_L);
}

export function classifier(w) {
  if (w.i_mass < 0.87) {
    w.r_mass = -1;
    w.r_type = 'Eternal — outlives universe';
  } else if (w.i_mass <= 8) {
    w.r_mass = 0.109 * w.i_mass + 0.394;
    w.r_type = w.r_mass < 1.4 ? 'White Dwarf' : w.r_mass <= 3.0 ? 'Neutron Star' : 'Black Hole';
  } else {
    w.r_mass = 0.15 * w.i_mass;
    w.r_type = w.r_mass <= 3.0 ? 'Neutron Star' : 'Black Hole';
  }
}

export function msLifetime(s) {
  const Ls = s.L / SOLAR_L;
  if (Ls === 0) return 0;
  return (s.i_mass / Ls) * 10000;
}

// Matches C++ evolve() with v2 Fading Red Dwarf branch
export function buildEvoStages(s) {
  const msLife = msLifetime(s);
  const stages = [];
  // Stage 0
  stages.push({
    num: 'Stage 0', name: 'Main Sequence',
    age: '0 Myr',
    detail: `MS Lifetime: ${fmtAge(msLife)}`
  });
  // Stage 1
  if (s.i_mass < 0.5) {
    stages.push({
      num: 'Stage 1', name: 'Fading Red Dwarf',
      age: fmtAge(msLife),
      detail: 'Never leaves main sequence',
      special: true
    });
  } else {
    const g1name = s.i_mass < 8 ? 'Red Giant' : 'Supergiant';
    const postMs = msLife * 0.1;
    stages.push({
      num: 'Stage 1', name: g1name,
      age: fmtAge(msLife),
      detail: `Duration: ~${postMs.toFixed(1)} Myr`
    });
    // Stage 2 — final
    stages.push({
      num: 'Stage 2 — Final', name: s.r_type,
      age: fmtAge(msLife + postMs),
      detail: s.r_mass > 0 ? `Remnant: ${s.r_mass.toFixed(3)} M☉` : '',
      final: true
    });
  }
  return stages;
}

export function fmtAge(myr) {
  if (myr <= 0) return '—';
  if (myr > 1e6) return (myr / 1e6).toFixed(2) + ' Tyr';
  if (myr > 1000) return (myr / 1000).toFixed(2) + ' Gyr';
  return myr.toFixed(1) + ' Myr';
}
