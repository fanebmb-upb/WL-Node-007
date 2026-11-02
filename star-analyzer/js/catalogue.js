/* ════════════════════════════════════════
   CATALOGUE — presets, input validation, escaping
   Pure functions only (no DOM), tested under `node --test`.
════════════════════════════════════════ */

import { SOLAR_R, PARSEC, AU, LIGHT_YEAR, SOLAR_MASS, G_N, C_LIGHT } from './physics.js';

const RSUN = SOLAR_R;
// Sgr A*: the "radius" is its Schwarzschild radius (event horizon), so R <= schw_R
const SGR_A_MASS = 4.297e6;
const SGR_A_RS = (2 * G_N * (SGR_A_MASS * SOLAR_MASS)) / (C_LIGHT * C_LIGHT); // same expression as analyzeStar

// Catalogue values: radii/temps from published estimates (IAU nominal units)
export const PRESETS = [
  { name: 'Sun',              R: 6.957e8,  T: 5772,  d: 1.496e11, i_mass: 1.0   },
  { name: 'Proxima Centauri', R: 1.07e8,   T: 3042,  d: 4.02e16,  i_mass: 0.122 },
  { name: 'Sirius A',         R: 1.19e9,   T: 9940,  d: 8.15e16,  i_mass: 2.06  },
  { name: 'Vega',             R: 1.64e9,   T: 9602,  d: 2.37e17,  i_mass: 2.14  },
  { name: 'Rigel',            R: 5.49e10,  T: 12100, d: 8.02e18,  i_mass: 21    },
  { name: 'Betelgeuse',       R: 5.31e11,  T: 3600,  d: 5.18e18,  i_mass: 18    },
  { name: 'UY Scuti',         R: 1.19e12,  T: 3365,  d: 4.8e19,   i_mass: 10    },
  { name: 'Neutron Star X',   R: 1.2e4,    T: 1e6,   d: 3e19,     i_mass: 25    },
  // v4 additions. As above, i_mass doubles as the current mass in the engine.
  // Sources marked (compiled) are the values in the current Wikipedia infoboxes, which
  // cite the primary work named; the others are the values reported in the cited paper.
  // Aldebaran (α Tau, K5 III): R 44.13 R☉ (compiled; interferometric radii scatter
  // 36–46 R☉, see Richichi & Roccatagliata 2005, A&A 433, 305), Teff 3,910 K
  // (McWilliam 1990), M 1.16 M☉ (asteroseismic, Farr et al. 2018), d 20.43 pc (Hipparcos 2007)
  { name: 'Aldebaran',        R: 44.13 * RSUN,    T: 3910,  d: 20.43 * PARSEC,  i_mass: 1.16 },
  // Antares (α Sco A, M1.5 Iab): R 680 R☉, Teff 3,660 K, initial mass ~15 M☉
  // (Ohnaka et al. 2013, A&A 555, A24), d 170 pc (van Leeuwen 2007)
  { name: 'Antares',          R: 680 * RSUN,      T: 3660,  d: 170 * PARSEC,    i_mass: 15 },
  // Polaris (α UMi Aa, F7 Ib Cepheid): R 46.27 R☉, M 5.13 M☉ (compiled; CHARA orbit,
  // Evans et al. 2024), d 136.9 pc (Gaia DR3 via Polaris B, Evans et al. 2024),
  // Teff 6,015 K (Usenko et al. 2005)
  { name: 'Polaris',          R: 46.27 * RSUN,    T: 6015,  d: 136.9 * PARSEC,  i_mass: 5.13 },
  // Sirius B (DA white dwarf): M 1.018 M☉, R 0.008098 R☉, Teff 25,369 K
  // (Bond et al. 2017, ApJ 840, 70); d 2.64 pc (same system as Sirius A)
  { name: 'Sirius B',         R: 0.008098 * RSUN, T: 25369, d: 2.64 * PARSEC,   i_mass: 1.018 },
  // Barnard's Star (M4 V): R 0.187 R☉, Teff 3,195 K, M 0.162 M☉ (compiled; post-2018
  // CARMENES/interferometric values), d 1.828 pc (Gaia DR3 parallax 546.98 mas)
  { name: "Barnard's Star",   R: 0.187 * RSUN,    T: 3195,  d: 1.828 * PARSEC,  i_mass: 0.162 },
  // Sagittarius A* (supermassive black hole): M 4.297×10⁶ M☉, R₀ 8,277 pc
  // (GRAVITY Collaboration, A&A 657, L12, arXiv:2112.07478). T is its Hawking temperature
  // ħc³/(8πGMk) ≈ 1.4×10⁻¹⁴ K — the only blackbody temperature a black hole has.
  { name: 'Sagittarius A*',   R: SGR_A_RS,        T: 1.436e-14, d: 8277 * PARSEC, i_mass: SGR_A_MASS },
];

/* ── Input units ─────────────────────────────────────────────── */
export const RADIUS_UNITS = {
  Rsun: { label: 'R☉', toSI: RSUN },
  km:   { label: 'km', toSI: 1e3 },
  m:    { label: 'm',  toSI: 1 },
};
export const DISTANCE_UNITS = {
  ly: { label: 'ly', toSI: LIGHT_YEAR },
  pc: { label: 'pc', toSI: PARSEC },
  AU: { label: 'AU', toSI: AU },
  m:  { label: 'm',  toSI: 1 },
};
export function toSI(value, unit, table) {
  const u = table[unit];
  if (!u) throw new Error('unknown unit ' + unit);
  return value * u.toSI;
}

/* ── Share links ─────────────────────────────────────────────── */
// Registry → compact base64url string of [[name, R, T, d, i_mass], ...]
export function encodeShare(entries) {
  const rows = entries.map(({ name, R, T, d, i_mass }) => [name, R, T, d, i_mass]);
  const bytes = new TextEncoder().encode(JSON.stringify(rows));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Untrusted string → validated entries (same rules as saved registries); [] if malformed
export const MAX_SHARE_LEN = 200000;
export function decodeShare(code) {
  try {
    if (typeof code !== 'string' || !code || code.length > MAX_SHARE_LEN) return [];
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    if (!Array.isArray(rows)) return [];
    return sanitizeEntries(rows.map(r => Array.isArray(r)
      ? { name: r[0], R: r[1], T: r[2], d: r[3], i_mass: r[4] }
      : null));
  } catch {
    return [];
  }
}

export const MAX_NAME_LEN = 80;
export const MAX_ENTRIES  = 500;

// Escape text for interpolation into HTML (element content or quoted attributes)
export function escapeHTML(v) {
  return String(v).replace(/[&<>"'`]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;'
  })[ch]);
}

// Quote a CSV text field; prefix formula-trigger characters so spreadsheets
// don't evaluate a star named e.g. "=HYPERLINK(...)"
export function csvField(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

const posFinite = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Validate untrusted star records (localStorage, share links). Returns clean
// { name, R, T, d, i_mass } objects; anything malformed is dropped.
export function sanitizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (out.length >= MAX_ENTRIES) break;
    if (!p || typeof p !== 'object') continue;
    if (!(posFinite(p.R) && posFinite(p.T) && posFinite(p.d) && posFinite(p.i_mass))) continue;
    const name = String(p.name == null || p.name === '' ? 'Unknown Star' : p.name).slice(0, MAX_NAME_LEN);
    out.push({ name, R: p.R, T: p.T, d: p.d, i_mass: p.i_mass });
  }
  return out;
}
