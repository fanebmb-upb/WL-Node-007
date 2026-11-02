import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStar, classifier, SOLAR_R } from '../js/physics.js';
import { PRESETS } from '../js/catalogue.js';
import { buildTrack, zamsRadius, zamsLuminosity, hawkingT } from '../js/evolution.js';
import { objectKind, visualParams } from '../js/star-visuals.js';

const preset = n => { const s = { ...PRESETS.find(p => p.name === n) }; analyzeStar(s); classifier(s); return s; };
const synth = (base, st) => {
  const s = { name: base.name, R: st.R, T: st.T, d: base.d, i_mass: st.mass };
  analyzeStar(s); classifier(s);
  return s;
};

test('ZAMS relations are anchored at the Sun', () => {
  assert.equal(zamsRadius(1), 1);
  assert.equal(zamsLuminosity(1), 1);
});

test('Hawking temperature: 6.17e-8 K for one solar mass', () => {
  assert.ok(Math.abs(hawkingT(1) / 6.17e-8 - 1) < 0.01);
});

test('Sun track: main sequence → red giant (swells, cools) → white dwarf', () => {
  const sun = preset('Sun');
  const tr = buildTrack(sun);
  assert.deepEqual(tr.stages.map(s => s.name), ['Main Sequence', 'Red Giant', 'White Dwarf']);
  const ms = tr.at(0.1), tip = tr.at(0.84), wd = tr.at(0.95);
  assert.ok(ms.R / SOLAR_R < 1.3 && ms.T > 5000 && ms.T < 6500);
  assert.ok(tip.R / SOLAR_R > 100 && tip.T < 4200, 'giant is large and cool');
  assert.equal(objectKind(synth(sun, wd)), 'whitedwarf');
  // ages follow buildEvoStages: main sequence lasts ~10 Gyr
  assert.ok(Math.abs(tr.at(0.5).ageMyr - 10000) < 200);
});

test('massive star track ends as the classifier’s remnant', () => {
  const bet = preset('Betelgeuse');          // 18 M☉ → 2.7 M☉ neutron star
  const tr = buildTrack(bet);
  assert.equal(tr.stages[1].name, 'Supergiant');
  assert.ok(tr.at(0.84).R / SOLAR_R > 600);
  assert.equal(objectKind(synth(bet, tr.at(1))), 'neutron');
  const uy = preset('Rigel');                // 21 M☉ → 3.15 M☉ black hole
  assert.equal(objectKind(synth(uy, buildTrack(uy).at(1))), 'blackhole');
});

test('fading red dwarf never leaves the main sequence', () => {
  const tr = buildTrack(preset('Proxima Centauri'));
  assert.equal(tr.stages.length, 1);
  for (const f of [0, 0.5, 1]) assert.ok(tr.at(f).R / SOLAR_R < 0.3);
});

test('track states always render (finite params)', () => {
  for (const p of PRESETS) {
    const s = preset(p.name);
    if (objectKind(s) !== 'star') continue;
    const tr = buildTrack(s);
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const vp = visualParams(synth(s, tr.at(f)));
      for (const k of ['screenPx', 'limbU', 'glow', 'granCells', 'core']) {
        assert.ok(Number.isFinite(vp[k]), `${p.name} f=${f.toFixed(2)} ${k}=${vp[k]}`);
      }
    }
  }
});
