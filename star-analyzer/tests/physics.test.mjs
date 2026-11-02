// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOLAR_L, analyzeStar, classifier, spectralClass, buildEvoStages, msLifetime,
} from '../js/physics.js';
import { PRESETS } from '../js/catalogue.js';

const preset = name => {
  const s = { ...PRESETS.find(p => p.name === name) };
  analyzeStar(s); classifier(s);
  return s;
};
const close = (actual, expected, relTol) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= relTol,
    `expected ${actual} within ${relTol * 100}% of ${expected}`);

test('Sun preset: luminosity ≈ 3.828e26 W within 1%', () => {
  close(preset('Sun').L, 3.828e26, 0.01);
});

test('Sun preset: Wien peak ≈ 502 nm', () => {
  close(preset('Sun').lambda * 1e9, 502, 0.005);
});

test('Sun preset: spectral class G2', () => {
  assert.equal(preset('Sun').spec, 'G2');
});

test('Sun preset: bolometric magnitude matches IAU zero point', () => {
  assert.ok(Math.abs(preset('Sun').M_bol - 4.74) < 0.01);
});

test('Betelgeuse classifies as an M star', () => {
  assert.match(preset('Betelgeuse').spec, /^M\d$/);
});

test('Neutron-star preset falls inside its Schwarzschild radius (R <= schw_R branch)', () => {
  const s = preset('Neutron Star X');
  assert.ok(s.R <= s.schw_R);
  assert.equal(s.redshift_F, 0);
  assert.equal(s.redshift_T, 0);
  assert.match(s.status, /Black hole/);
});

test('ordinary stars take the photon-escapes branch', () => {
  const s = preset('Sun');
  assert.ok(s.redshift_F > 0.99 && s.redshift_F < 1);
  assert.match(s.status, /Photon escapes/);
});

test('spectralClass band edges', () => {
  assert.equal(spectralClass(60000), 'O0');
  assert.equal(spectralClass(30000), 'O9');
  assert.equal(spectralClass(29999), 'B0');
  assert.equal(spectralClass(3700), 'K9');
  assert.equal(spectralClass(3699), 'M0');
  assert.equal(spectralClass(2000), 'L (brown dwarf)');
  assert.equal(spectralClass(1000), 'T (brown dwarf)');
  assert.equal(spectralClass(500), 'Y (sub-stellar)');
});

test('classifier remnant boundaries', () => {
  const cls = m => { const s = { i_mass: m }; classifier(s); return s; };
  // Below 0.87 M☉: never evolves off the main sequence within the age of the universe
  assert.equal(cls(0.869).r_type, 'Eternal — outlives universe');
  assert.equal(cls(0.869).r_mass, -1);
  // 0.87–8 M☉: initial–final mass relation 0.109·M + 0.394, always < 1.4 M☉
  assert.equal(cls(0.87).r_type, 'White Dwarf');
  assert.equal(cls(8).r_type, 'White Dwarf');
  close(cls(8).r_mass, 0.109 * 8 + 0.394, 1e-12);
  // > 8 M☉: r_mass = 0.15·M; ≤ 3.0 M☉ → neutron star, else black hole
  assert.equal(cls(8.01).r_type, 'Neutron Star');
  assert.equal(cls(20).r_type, 'Neutron Star');   // 3.0 M☉ exactly
  assert.equal(cls(20.01).r_type, 'Black Hole');
});

test('evolution stages: fading red dwarf vs giant branch', () => {
  const prox = preset('Proxima Centauri');
  const pStages = buildEvoStages(prox);
  assert.equal(pStages.length, 2);
  assert.equal(pStages[1].name, 'Fading Red Dwarf');

  const sun = preset('Sun');
  const sStages = buildEvoStages(sun);
  assert.deepEqual(sStages.map(s => s.name), ['Main Sequence', 'Red Giant', 'White Dwarf']);
  // 10 Gyr · M/L for the Sun
  close(msLifetime(sun), 10000, 0.01);

  assert.equal(buildEvoStages(preset('Rigel'))[1].name, 'Supergiant');
});

test('all presets analyse to finite numbers', () => {
  for (const p of PRESETS) {
    const s = preset(p.name);
    for (const k of ['L', 'lambda', 'F', 'P', 'schw_R', 'M_bol', 'logg', 'v_esc']) {
      assert.ok(Number.isFinite(s[k]), `${p.name}.${k} = ${s[k]}`);
    }
    assert.ok(s.L / SOLAR_L > 0);
  }
});
