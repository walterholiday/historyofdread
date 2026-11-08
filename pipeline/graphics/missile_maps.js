// Episode 1 key visual: one missile, then five, then what a real first strike would look like.
//   node missile_maps.js <out-dir> [--stills]
// Writes map-one-missile.mp4, map-five-missiles.mp4, map-hundreds-of-missiles.mp4.

const path = require('path');
const fs = require('fs');
const { W, H, FPS, C, svgDoc, text, tag, renderVideo, writePng, ease, clamp01 } = require('./common');
const { makeProjection, baseMap, labelAt, arc, SITES, rng } = require('./maps');

const out = process.argv[2] || 'out';
const stillsOnly = process.argv.includes('--stills');
fs.mkdirSync(out, { recursive: true });

const proj = makeProjection({ rotate: [105, -90, 0], scale: 530, center: [1180, 520], clip: 56 });
const [mx, my] = proj(SITES.soviet.moscow);
const BASE = baseMap(proj) +
  labelAt(proj, [-82, 39.5], 'UNITED STATES', { opacity: 0.6 }) +
  labelAt(proj, [85, 63], 'SOVIET UNION', { opacity: 0.6 }) +
  `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="5" fill="${C.bone}" fill-opacity="0.8"/>` +
  text(mx + 14, my + 26, 'MOSCOW', { size: 18, weight: 500, fill: C.bone, opacity: 0.7, spacing: 0.2 });

const FLIGHT = 4.0; // seconds for an arc to draw on screen

// The five false launches: all from the same region, aimed at the western USSR (illustrative).
const FIVE = [
  [SITES.us.malmstrom, SITES.soviet.moscow],
  [[-110.4, 47.9], SITES.soviet.kozelsk],
  [[-111.9, 47.1], SITES.soviet.teykovo],
  [[-110.8, 46.8], SITES.soviet.leningrad],
  [[-111.6, 48.0], SITES.soviet.kostroma],
];
const FIVE_STARTS = [0.6, 2.4, 4.2, 6.0, 7.8];

function hud(label, count, subLines = []) {
  return text(96, 128, label, { size: 22, weight: 500, fill: C.dim, spacing: 0.22 }) +
    text(96, 240, count, { size: count.length > 3 ? 84 : 112, weight: 600, fill: C.red, spacing: 0.02 }) +
    subLines.map((l, k) => text(96, 300 + k * 34, l, { size: 22, weight: 500, fill: C.dim, spacing: 0.18 })).join('');
}

function stamp() {
  return text(96, H - 120, '26 SEPTEMBER 1983', { size: 22, weight: 500, fill: C.dim, spacing: 0.22 }) +
    text(96, H - 84, '00:15 MOSCOW TIME', { size: 22, weight: 500, fill: C.dim, spacing: 0.22 });
}

function progressAt(t, start) {
  return ease(clamp01((t - start) / FLIGHT));
}

// --- 1. One missile -------------------------------------------------------
function oneFrame(i) {
  const t = i / FPS;
  const p = progressAt(t, 0.6);
  const n = t >= 0.6 ? '1' : '0';
  return svgDoc(BASE + arc(proj, ...FIVE[0], p, { width: 3.5 }) +
    hud('LAUNCHES DETECTED', n) + stamp() + tag('ILLUSTRATION'));
}

// --- 2. Five missiles -----------------------------------------------------
function fiveFrame(i) {
  const t = i / FPS;
  let body = BASE;
  let n = 0;
  FIVE.forEach(([a, b], k) => {
    if (t >= FIVE_STARTS[k]) n = k + 1;
    body += arc(proj, a, b, progressAt(t, FIVE_STARTS[k]), { width: 3.5 });
  });
  return svgDoc(body + hud('LAUNCHES DETECTED', String(n)) + stamp() + tag('ILLUSTRATION'));
}

// --- 3. Hundreds ------------------------------------------------------------
// Hundreds of arcs from every Minuteman field and from submarines at sea,
// aimed across the whole Soviet Union, launched in a rolling wave.
const r = rng(1983);
const usFields = Object.values(SITES.us);
const seaZones = Object.values(SITES.sea);
const targets = Object.values(SITES.soviet);
const jitter = ([lon, lat], d) => [lon + (r() - 0.5) * d * 2, lat + (r() - 0.5) * d];
const STRIKE = [];
for (let k = 0; k < 420; k++) {
  const fromSea = r() < 0.22;
  const from = fromSea ? jitter(seaZones[Math.floor(r() * seaZones.length)], 6) : jitter(usFields[Math.floor(r() * usFields.length)], 1.2);
  const to = jitter(targets[Math.floor(r() * targets.length)], 2.2);
  // Wave: a few at first, then a flood.
  const start = 1.2 + Math.pow(r(), 0.6) * 6.5;
  STRIKE.push({ from, to, start });
}

function hundredsFrame(i) {
  const t = i / FPS;
  let body = BASE;
  // The five false alarms stay on screen, dimmed, for comparison.
  FIVE.forEach(([a, b]) => { body += arc(proj, a, b, 1, { width: 2.5, color: C.dim }); });
  let launched = 0;
  for (const s of STRIKE) {
    const p = progressAt(t, s.start);
    if (p > 0) launched++;
    body += arc(proj, s.from, s.to, p, { width: 1.6, head: p < 1 });
  }
  const h = launched === 0
    ? hud('LAUNCHES DETECTED', '5', ['WHAT THE SCREEN SHOWED'])
    : hud('A REAL FIRST STRIKE', 'HUNDREDS', ['ALL AT ONCE, AIMED AT SILOS,', 'BOMBERS AND COMMAND CENTRES']);
  return svgDoc(body + h + tag('ILLUSTRATION'));
}

const clips = [
  { name: 'map-one-missile', frame: oneFrame, seconds: 6, hold: 24 },
  { name: 'map-five-missiles', frame: fiveFrame, seconds: 12.5, hold: 22 },
  { name: 'map-hundreds-of-missiles', frame: hundredsFrame, seconds: 12.5, hold: 22 },
];

(async () => {
  for (const c of clips) {
    if (stillsOnly) {
      for (const s of [0.3, c.seconds * 0.45, c.seconds - 0.1]) {
        writePng(path.join(out, `${c.name}_${s.toFixed(1)}s.png`), c.frame(Math.round(s * FPS)));
      }
      continue;
    }
    const t0 = Date.now();
    await renderVideo(path.join(out, `${c.name}.mp4`), Math.round(c.seconds * FPS), c.frame, { holdSeconds: c.hold });
    console.log(`${c.name}.mp4 (${((Date.now() - t0) / 1000).toFixed(0)}s to render)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
