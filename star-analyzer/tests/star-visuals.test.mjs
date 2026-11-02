import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStar, classifier } from '../js/physics.js';
import { PRESETS } from '../js/catalogue.js';
import {
  objectKind, limbDarkeningU, granulationCells, convectionAmount, visualParams, trueSizeLabel,
} from '../js/star-visuals.js';

const star = p => { const s = { ...p }; analyzeStar(s); classifier(s); return s; };
const preset = name => star(PRESETS.find(p => p.name === name));

test('objectKind follows current radius and mass', () => {
  assert.equal(objectKind(preset('Sun')), 'star');
  assert.equal(objectKind(preset('Betelgeuse')), 'star');
  assert.equal(objectKind(preset('Neutron Star X')), 'blackhole'); // R <= schw_R
  // 1.4 M☉ at 12 km sits outside its 4.1 km Schwarzschild radius
  assert.equal(objectKind(star({ name: 'PSR', R: 1.2e4, T: 1e6, d: 1e19, i_mass: 1.4 })), 'neutron');
  assert.equal(objectKind(star({ name: 'WD', R: 5.6e6, T: 25000, d: 1e17, i_mass: 1.0 })), 'whitedwarf');
});

test('limb darkening: ≈0.6 for the Sun, weaker for hot stars, stronger for cool', () => {
  assert.ok(Math.abs(limbDarkeningU(5772) - 0.6) < 1e-9);
  assert.ok(limbDarkeningU(25000) < 0.4);
  assert.ok(limbDarkeningU(3000) > 0.65);
});

test('granulation: supergiants show a few huge cells, the Sun fine grain', () => {
  const sun = granulationCells(preset('Sun'));
  assert.ok(sun > 35 && sun < 45, `Sun ${sun}`);
  assert.ok(granulationCells(preset('Betelgeuse')) < 8);
  assert.ok(granulationCells(preset('UY Scuti')) < 8);
  assert.ok(granulationCells(preset('Proxima Centauri')) > sun);
});

test('convection switches off for hot radiative envelopes', () => {
  assert.equal(convectionAmount(5772), 1);
  assert.equal(convectionAmount(9940), 0);
  assert.equal(visualParams(preset('Rigel')).granAmp, 0);
  assert.equal(visualParams(preset('Sun')).granAmp, 1);
});

test('feature flags: M dwarfs flare and spot, giants get haze', () => {
  const prox = visualParams(preset('Proxima Centauri'));
  assert.ok(prox.flares && prox.spots > 0);
  const sun = visualParams(preset('Sun'));
  assert.ok(!sun.flares && sun.spots === 0 && sun.haze === 0);
  const bet = visualParams(preset('Betelgeuse'));
  assert.ok(bet.haze > 0.9 && bet.irregular > 0.9 && !bet.flares);
  const rigel = visualParams(preset('Rigel'));
  assert.ok(rigel.irregular === 0, 'hot supergiant limb stays regular');
});

test('glow grows with luminosity', () => {
  assert.ok(visualParams(preset('Rigel')).glow > visualParams(preset('Sun')).glow);
  assert.ok(visualParams(preset('Sun')).glow > visualParams(preset('Proxima Centauri')).glow);
});

test('true-size labels', () => {
  assert.equal(trueSizeLabel(preset('Sun')), '1.00 R☉');
  assert.equal(trueSizeLabel(preset('Betelgeuse')), '763 R☉');
  assert.match(trueSizeLabel(preset('Neutron Star X')), /^horizon 73\.\d km/);
});
