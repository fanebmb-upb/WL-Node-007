/* ════════════════════════════════════════
   EVOLUTION PLAYBACK — approximate radius/temperature track
   NOT a stellar-evolution model. It strings together textbook scaling
   relations so the renderer can morph through the stages that
   buildEvoStages() lists:
   - ZAMS radius  R ≈ M^0.8 (M ≤ 1), M^0.57 (M > 1)          [R☉]
   - ZAMS luminosity: piecewise mass–luminosity relation      [L☉]
   - main sequence: R grows ~30 %, L ~60 % by the end
   - giant tip: R ≈ 150·M^0.4 R☉ at ~3,800 K (low mass);
     supergiant R ≈ 700·√(M/15) R☉ at ~3,500 K (M ≥ 8)
   - remnants: white dwarf R ≈ 0.0126·M^(-1/3) R☉ cooling from ~60,000 K;
     neutron star 12 km at 10⁶ K; black hole at its Schwarzschild radius
   Mass loss, blue loops, Wolf–Rayet phases etc. are ignored.
════════════════════════════════════════ */
import {
  SOLAR_R, SOLAR_T, SOLAR_MASS, G_N, C_LIGHT, H_PLANCK, K_B, PI,
  msLifetime, buildEvoStages,
} from './physics.js';

const lerp = (a, b, t) => a + (b - a) * t;
const lerpLog = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const ease = t => t * t * (3 - 2 * t);

export function zamsRadius(M) { return M <= 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57); }
export function zamsLuminosity(M) {
  if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
  if (M <= 2) return Math.pow(M, 4);
  if (M <= 55) return 1.4 * Math.pow(M, 3.5);
  return 32000 * M;
}
const tempFrom = (Lsun, Rsun) => SOLAR_T * Math.pow(Lsun / (Rsun * Rsun), 0.25);
const schwarzschild = Msun => 2 * G_N * Msun * SOLAR_MASS / (C_LIGHT * C_LIGHT);
// Hawking temperature ħc³ / (8πGMk)
export const hawkingT = Msun => H_PLANCK / (2 * PI) * C_LIGHT ** 3 / (8 * PI * G_N * Msun * SOLAR_MASS * K_B);

/**
 * Build a playback track for an analysed main-sequence-or-later star.
 * Returns { stages: [{name, from, to}], at(f) } with f ∈ [0, 1] (time axis not to scale).
 */
export function buildTrack(s) {
  const M = s.i_mass;
  const evo = buildEvoStages(s);
  const msLife = msLifetime(s);
  const postMs = msLife * 0.1;
  const R0 = zamsRadius(M), L0 = zamsLuminosity(M);
  const R1 = R0 * 1.3, L1 = L0 * 1.6;
  const T0 = tempFrom(L0, R0), T1 = tempFrom(L1, R1);
  const fading = M < 0.5;
  const supergiant = M >= 8;
  const Rg = supergiant ? 700 * Math.sqrt(M / 15) : 150 * Math.pow(M, 0.4);
  const Tg = supergiant ? 3500 : 3800;
  const eternal = !(s.r_mass > 0);

  const stages = fading
    ? [{ name: evo[0].name, from: 0, to: 1 }]
    : [
      { name: evo[0].name, from: 0, to: 0.5 },
      { name: evo[1].name, from: 0.5, to: 0.85 },
      { name: evo[2].name, from: 0.85, to: 1 },
    ];

  function at(f) {
    f = Math.max(0, Math.min(1, f));
    const idx = stages.findIndex(st => f <= st.to);
    const st = stages[idx < 0 ? stages.length - 1 : idx];
    const i = stages.indexOf(st);
    const t = (f - st.from) / (st.to - st.from || 1);
    let R, T, mass = M, age, label = st.name;

    if (i === 0) {
      R = lerp(R0, R1, t) * SOLAR_R;
      T = fading ? lerp(T0, T0 * 1.05, t) : lerp(T0, T1, t);
      age = t * msLife;
      if (fading) label += ' → Fading Red Dwarf';
    } else if (i === 1) {
      const e = ease(t);
      R = lerpLog(R1, Rg, e) * SOLAR_R;
      T = lerpLog(T1, Tg, e);
      age = msLife + t * postMs;
    } else {
      age = msLife + postMs;
      if (eternal) {
        // r_mass < 0: the engine says it outlives the universe — hold the giant
        R = Rg * SOLAR_R; T = Tg;
      } else if (s.r_type === 'White Dwarf') {
        mass = s.r_mass;
        R = 0.0126 * Math.pow(mass, -1 / 3) * SOLAR_R;
        T = lerpLog(60000, 12000, t);
      } else if (s.r_type === 'Neutron Star') {
        mass = s.r_mass; R = 1.2e4; T = 1e6;
      } else {
        mass = s.r_mass; R = schwarzschild(mass) * 0.999; T = hawkingT(mass);
      }
    }
    return { f, stageIndex: i, label, R, T, mass, ageMyr: age };
  }
  return { stages, at };
}
