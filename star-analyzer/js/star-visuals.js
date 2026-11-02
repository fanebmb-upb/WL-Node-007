/* ════════════════════════════════════════
   STAR VISUALS — physical properties → render parameters
   Pure (no DOM / WebGL), so it is unit-tested. Each parameter is marked
   [physics] when it follows from a physical relation, or [art] when it is an
   illustrative choice that only follows a physical trend.
════════════════════════════════════════ */
import { SOLAR_R, SOLAR_T, SOLAR_L, G_N, SOLAR_MASS, blackbodyRGB } from './physics.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// Neutron stars are ~10–15 km; anything this small that isn't inside its
// Schwarzschild radius is treated as one. White dwarfs have log g ≈ 7–9.
const NEUTRON_MAX_R = 1e5;      // m
const WHITE_DWARF_LOGG = 6.5;   // cgs

// What the object is *now*, from its current radius/mass (not its future remnant)
export function objectKind(s) {
  if (s.R <= s.schw_R) return 'blackhole';
  if (s.R < NEUTRON_MAX_R) return 'neutron';
  if (s.logg >= WHITE_DWARF_LOGG) return 'whitedwarf';
  return 'star';
}

// [physics, approximate] Linear limb-darkening coefficient u in I(μ) = 1 − u(1 − μ)
// for the visible band. u ≈ 0.6 for the Sun, falling towards ~0.3 for hot B/O
// stars and rising to ~0.75 for cool M stars (trend of Claret 2000 tables).
export function limbDarkeningU(T) {
  return clamp(0.6 - 0.42 * Math.log10(T / SOLAR_T), 0.2, 0.8);
}

// [art, physically scaled] Number of convection cells across the stellar
// diameter. Granule size tracks the pressure scale height H ∝ T/g, so the
// count across the disk ∝ R/H ∝ gR/T. The square root compresses the 10⁵×
// real range into something drawable; it is anchored at ~40 for the Sun.
export function granulationCells(s) {
  const g = G_N * s.i_mass * SOLAR_MASS / (s.R * s.R);
  const gSun = G_N * SOLAR_MASS / (SOLAR_R * SOLAR_R);
  const rel = (g * s.R / s.T) / (gSun * SOLAR_R / SOLAR_T);
  return clamp(40 * Math.sqrt(rel), 2.5, 64);
}

// [art] Fraction of surface convection: on below ~7,000 K, gone above ~7,500 K
export function convectionAmount(T) {
  return 1 - smooth(6500, 7500, T);
}

// On-screen radius in the 240 px-tall v3 canvas (kept log-scaled as before)
export function screenRadiusPx(R) {
  const logR = Math.log10(Math.max(R / SOLAR_R, 0.001) + 1);
  return Math.max(18, Math.min(68, logR * 38 + 18));
}

function fmtNum(v) {
  if (v >= 1e6) return v.toExponential(2).replace('e+', '×10^');
  if (v >= 100) return Math.round(v).toLocaleString('en-US');
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toPrecision(2);
}
function fmtLen(m) {
  if (m >= 1e9) return fmtNum(m / 1e9) + ' million km';
  if (m >= 1e3) return fmtNum(m / 1e3) + ' km';
  return fmtNum(m) + ' m';
}

// True-size label such as "883 R☉"
export function trueSizeLabel(s, kind = objectKind(s)) {
  const rr = s.R / SOLAR_R;
  if (kind === 'blackhole') {
    const rs = s.schw_R;
    return `horizon ${fmtLen(rs)} · ${fmtNum(rs / SOLAR_R)} R☉`;
  }
  if (kind === 'neutron') return `${fmtLen(s.R)} · ${rr.toExponential(1)} R☉`;
  if (kind === 'whitedwarf') return `${fmtNum(rr)} R☉ · ${fmtLen(s.R)}`;
  return `${fmtNum(rr)} R☉`;
}

// Everything the renderer needs, derived from an analysed star
export function visualParams(s) {
  const kind = objectKind(s);
  const T = s.T;
  const Lsun = Math.max(s.L / SOLAR_L, 1e-30);
  const logL = Math.log10(Lsun);
  const hotness = smooth(7500, 20000, T);
  const vp = {
    kind,
    name: s.name,
    T,
    logg: s.logg,
    color: blackbodyRGB(T),                           // [physics] linear sRGB, CIE-integrated
    limbU: limbDarkeningU(T),                         // [physics, approx.]
    screenPx: screenRadiusPx(s.R),                    // log-scaled display size
    schwRatio: s.schw_R / s.R,                        // [physics] rₛ/R for the dashed ring
    sizeLabel: trueSizeLabel(s, kind),
    // [art] "hotter = brighter core": mild boost above the Sun's temperature
    core: 1 + 0.55 * clamp(Math.log10(T / SOLAR_T), 0, 1),
    // [art] glow/bloom scaled by luminosity (log), stronger for hot stars
    glow: clamp(0.38 + 0.075 * logL, 0.18, 1.0) + 0.3 * hotness,
    granAmp: 0, granCells: granulationCells(s), spots: 0, flares: false,
    giant: 0, irregular: 0, haze: 0,
    rotSpeed: 0.08,                                   // [art] rad/s — real periods are days to years
    seed: hashName(s.name || ''),
  };
  if (kind === 'star') {
    vp.granAmp = convectionAmount(T);
    // Giants/supergiants: low gravity → extended, softer, irregular limb + mass-loss haze
    vp.giant = smooth(3.5, 0.0, s.logg);
    vp.irregular = vp.giant * (1 - smooth(4500, 6500, T));
    vp.haze = vp.giant;
    vp.rotSpeed = 0.08 - 0.05 * vp.giant;
    // Cool dwarfs (K/M, high gravity): starspots; M dwarfs flare
    if (T < 5200 && s.logg >= 4.0) vp.spots = clamp((5200 - T) / 1800, 0.35, 1);
    vp.flares = T < 3900 && s.logg >= 4.5;
  } else if (kind === 'whitedwarf') {
    vp.glow = 0.75; vp.core = 1.35; vp.rotSpeed = 0.25;
  } else if (kind === 'neutron') {
    vp.glow = 0.9; vp.core = 1.5; vp.rotSpeed = 2.4; // [art] real pulsars spin at 1–700 Hz
  }
  return vp;
}

function hashName(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
