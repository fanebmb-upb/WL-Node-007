import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kelvinToHex, blackbodyRGB, cieXYZ } from '../js/physics.js';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

test('CIE fit peaks where the 1931 2° observer does', () => {
  // ȳ peaks at 555 nm with value ≈ 1; x̄ red lobe ≈ 1.06 near 600 nm
  assert.ok(Math.abs(cieXYZ(555)[1] - 1) < 0.02);
  assert.ok(Math.abs(cieXYZ(600)[0] - 1.06) < 0.03);
});

test('Sun (5772 K) is near-white with a slight warm tint', () => {
  const [r, g, b] = rgb(kelvinToHex(5772));
  assert.equal(r, 255);
  assert.ok(r > g && g > b, `warm ordering r>g>b: ${r},${g},${b}`);
  assert.ok(b >= 215, `blue channel stays high (near-white): ${b}`);
});

test('6500 K is close to the D65 white point', () => {
  const [r, g, b] = rgb(kelvinToHex(6500));
  assert.ok(Math.min(r, g, b) >= 240, `${r},${g},${b}`);
});

test('M stars are orange-red', () => {
  for (const T of [2400, 3000, 3600]) {
    const [r, g, b] = rgb(kelvinToHex(T));
    assert.equal(r, 255);
    assert.ok(g < 215 && b < 150 && g - b > 50, `${T} K → ${r},${g},${b}`);
  }
});

test('hot stars are blue-white: blue is the brightest channel', () => {
  for (const T of [12100, 25000]) {
    const [r, g, b] = rgb(kelvinToHex(T));
    assert.equal(b, 255);
    assert.ok(r < g && g < b, `${T} K → ${r},${g},${b}`);
  }
});

test('out-of-range temperatures clamp gracefully', () => {
  assert.equal(kelvinToHex(1e6), kelvinToHex(40000));   // neutron star: blue-white
  assert.equal(rgb(kelvinToHex(1e6))[2], 255);
  assert.equal(kelvinToHex(100), kelvinToHex(1000));    // very cool: deep red
  assert.equal(kelvinToHex(1.4e-14), kelvinToHex(1000)); // Hawking temperature
  for (const T of [0, -5, NaN, Infinity]) assert.match(kelvinToHex(T), /^#[0-9a-f]{6}$/);
});

test('colour varies monotonically: hotter is bluer', () => {
  let prev = -1;
  for (let T = 1500; T <= 40000; T *= 1.25) {
    const [r, , b] = blackbodyRGB(T);
    assert.ok(b / r >= prev, `b/r not monotonic at ${T}`);
    prev = b / r;
  }
});
