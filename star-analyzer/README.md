# Stellar Observatory — Star Analyzer

**Live demo: https://stellar-observatory-zeta.vercel.app**

A single-page star analyzer: enter a star's radius, temperature, distance and mass
(or load the presets) to get its luminosity, Planck spectrum, spectral class,
gravitational redshift and evolution timeline, plotted on a live
Hertzsprung–Russell diagram.

Each star is rendered in WebGL from its computed properties: blackbody colour
from the CIE 1931 colour-matching functions, temperature-dependent limb
darkening, convection cells scaled by surface gravity, starspots and flares on
M dwarfs, pulsar beams for neutron stars, and a Doppler-beamed accretion disk
for black holes. Colour and limb darkening are physically derived; surface
texture is illustrative.

It also has evolution playback, a true-scale size comparison with the Sun and
Earth, side-by-side comparison of two stars, CSV export, and share links.

`star.cpp` is the original C++ engine the web physics was ported from.

## Running it

It is a static site with no build step, but it uses JavaScript modules, so it
must be served over HTTP; opening `index.html` directly from disk will not work.

```powershell
cd star-analyzer
python -m http.server 8000
```

Then open http://127.0.0.1:8000/index.html. Three.js and the fonts load from a
CDN, so an internet connection is needed; without WebGL the page falls back to
a 2D preview.

## Tests

The physics, colour and validation code is tested with Node's built-in test
runner (Node 20+, no packages):

```powershell
cd star-analyzer
node --test
```

## Layout

| Path | Contents |
|---|---|
| `index.html` | Page, styles and UI logic |
| `js/physics.js` | Constants, Planck law, spectral class, blackbody colour, star analysis |
| `js/catalogue.js` | Presets, unit conversion, input validation, share-link encoding |
| `js/star-visuals.js` | Maps physical properties to render parameters |
| `js/star-renderer.js` | Three.js renderer |
| `js/evolution.js` | Approximate radius/temperature track for evolution playback |
| `tests/` | `node --test` suites |
| `star.cpp` | Original C++ reference implementation |
