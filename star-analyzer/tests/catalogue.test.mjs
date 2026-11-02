import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHTML, csvField, sanitizeEntries, MAX_NAME_LEN,
  PRESETS, RADIUS_UNITS, DISTANCE_UNITS, toSI, encodeShare, decodeShare,
} from '../js/catalogue.js';
import { analyzeStar, classifier, SOLAR_R, PARSEC, LIGHT_YEAR, AU } from '../js/physics.js';
import { objectKind } from '../js/star-visuals.js';

test('escapeHTML neutralises markup and attribute breakouts', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHTML(`a&b'c\`d`), 'a&amp;b&#39;c&#96;d');
  assert.equal(escapeHTML('Proxima Centauri'), 'Proxima Centauri');
  assert.equal(escapeHTML(42), '42');
});

test('csvField quotes and defuses spreadsheet formulas', () => {
  assert.equal(csvField('Sun'), '"Sun"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvField('-1+1'), `"'-1+1"`);
});

test('sanitizeEntries keeps valid records and drops malformed ones', () => {
  const out = sanitizeEntries([
    { name: 'Sun', R: 6.957e8, T: 5772, d: 1.496e11, i_mass: 1 },
    { name: 'neg', R: -1, T: 5772, d: 1, i_mass: 1 },
    { name: 'str', R: '5', T: 5772, d: 1, i_mass: 1 },
    { name: 'inf', R: Infinity, T: 5772, d: 1, i_mass: 1 },
    { name: 'nan', R: NaN, T: 5772, d: 1, i_mass: 1 },
    null, 7, 'x',
    { R: 1, T: 2, d: 3, i_mass: 4, extra: '<script>' },
    { name: 'x'.repeat(500), R: 1, T: 2, d: 3, i_mass: 4 },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].name, 'Sun');
  assert.equal(out[1].name, 'Unknown Star');
  assert.equal(out[1].extra, undefined);
  assert.equal(out[2].name.length, MAX_NAME_LEN);
});

test('sanitizeEntries rejects non-arrays', () => {
  assert.deepEqual(sanitizeEntries({}), []);
  assert.deepEqual(sanitizeEntries(null), []);
  assert.deepEqual(sanitizeEntries('[]'), []);
});

test('unit conversion to SI', () => {
  assert.equal(toSI(1, 'Rsun', RADIUS_UNITS), SOLAR_R);
  assert.equal(toSI(696.34, 'km', RADIUS_UNITS), 696340);
  assert.equal(toSI(5, 'm', RADIUS_UNITS), 5);
  assert.equal(toSI(1, 'pc', DISTANCE_UNITS), PARSEC);
  assert.equal(toSI(1, 'ly', DISTANCE_UNITS), LIGHT_YEAR);
  assert.equal(toSI(1, 'AU', DISTANCE_UNITS), AU);
  // 1 pc ≈ 3.2616 ly ≈ 206,265 AU
  assert.ok(Math.abs(PARSEC / LIGHT_YEAR - 3.2616) < 1e-4);
  assert.ok(Math.abs(PARSEC / AU - 206264.8) < 0.1);
  assert.throws(() => toSI(1, 'furlong', DISTANCE_UNITS));
});

test('share links round-trip, including non-ASCII names', () => {
  const entries = [
    { name: 'Sun', R: 6.957e8, T: 5772, d: 1.496e11, i_mass: 1 },
    { name: 'α Centauri A ☉ "quoted"', R: 8.5e8, T: 5790, d: 4.1e16, i_mass: 1.1 },
  ];
  const code = encodeShare(entries);
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'URL-safe');
  assert.deepEqual(decodeShare(code), entries);
});

test('share links: hostile or malformed input is rejected or sanitised', () => {
  for (const bad of ['', '!!!', 'e30', null, 42, 'x'.repeat(300000)]) {
    assert.deepEqual(decodeShare(bad), []);
  }
  const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  assert.deepEqual(decodeShare(enc({ a: 1 })), []);
  const out = decodeShare(enc([['<b>x</b>', 1, 2, 3, 4], ['neg', -1, 2, 3, 4], 'junk', ['NaN', 'a', 2, 3, 4]]));
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '<b>x</b>');   // kept as text; escaped at render time
});

test('new presets classify as expected', () => {
  const get = n => { const s = { ...PRESETS.find(p => p.name === n) }; analyzeStar(s); classifier(s); return s; };
  assert.match(get('Aldebaran').spec, /^K/);
  assert.match(get('Antares').spec, /^M/);
  assert.match(get('Polaris').spec, /^F/);
  assert.match(get("Barnard's Star").spec, /^M/);
  assert.equal(objectKind(get('Sirius B')), 'whitedwarf');
  const sgr = get('Sagittarius A*');
  assert.ok(sgr.R <= sgr.schw_R);
  assert.equal(objectKind(sgr), 'blackhole');
  assert.ok(Math.abs(sgr.schw_R / 1.269e10 - 1) < 0.001);
});
