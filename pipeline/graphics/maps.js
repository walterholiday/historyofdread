// Polar map of the Cold War: the United States, the Soviet Union, and missile arcs over the Arctic.

const d3 = require('d3-geo');
const topojson = require('topojson-client');
const { W, H, C, text } = require('./common');

const world = require('world-atlas/countries-50m.json');

// The Soviet Union in 1983, assembled from today's successor states.
const SOVIET = new Set(['Russia', 'Ukraine', 'Belarus', 'Moldova', 'Lithuania', 'Latvia', 'Estonia',
  'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan']);

const countries = world.objects.countries;
const land = topojson.feature(world, world.objects.land);
const ussr = topojson.merge(world, countries.geometries.filter((g) => SOVIET.has(g.properties.name)));
const usa = topojson.merge(world, countries.geometries.filter((g) => g.properties.name === 'United States of America'));

function makeProjection({ rotate = [105, -90, 0], scale = 530, center = [W / 2, H / 2], clip = 56 } = {}) {
  return d3.geoAzimuthalEquidistant().rotate(rotate).scale(scale).translate(center).clipAngle(clip).precision(0.2);
}

function baseMap(projection, { highlight = true } = {}) {
  const p = d3.geoPath(projection);
  const graticule = d3.geoGraticule().step([30, 10])();
  const sphere = p({ type: 'Sphere' });
  return `
<path d="${sphere}" fill="#11100F" stroke="${C.bone}" stroke-opacity="0.08" stroke-width="1.5"/>
<path d="${p(graticule)}" fill="none" stroke="${C.bone}" stroke-opacity="0.05" stroke-width="1"/>
<path d="${p(land)}" fill="${C.land}" stroke="${C.bone}" stroke-opacity="0.28" stroke-width="1.1"/>
${highlight ? `<path d="${p(ussr)}" fill="${C.landHi}" stroke="${C.bone}" stroke-opacity="0.5" stroke-width="1.3"/>
<path d="${p(usa)}" fill="${C.landHi}" stroke="${C.bone}" stroke-opacity="0.5" stroke-width="1.3"/>` : ''}`;
}

function labelAt(projection, lonlat, s, opts = {}) {
  const [x, y] = projection(lonlat);
  return text(x, y, s, { size: 26, weight: 600, fill: C.bone, opacity: 0.75, anchor: 'middle', spacing: 0.3, ...opts });
}

// A missile on its great-circle path, drawn up to `progress` (0 to 1) with a fading trail.
function arc(projection, from, to, progress, { width = 3, head = true, color = C.red, trail = 0.45 } = {}) {
  if (progress <= 0) return '';
  const interp = d3.geoInterpolate(from, to);
  const steps = 60;
  const n = Math.max(2, Math.round(steps * progress));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(projection(interp((i / n) * progress)));
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    // Older parts of the path fade; the leading edge is bright.
    const age = 1 - i / (pts.length - 1);
    const op = progress >= 1 ? 0.55 : Math.max(0.12, 1 - age / trail);
    segs.push(`<line x1="${pts[i - 1][0].toFixed(1)}" y1="${pts[i - 1][1].toFixed(1)}" x2="${pts[i][0].toFixed(1)}" y2="${pts[i][1].toFixed(1)}" stroke="${color}" stroke-opacity="${op.toFixed(2)}" stroke-width="${width}" stroke-linecap="round"/>`);
  }
  let headSvg = '';
  if (head && progress < 1) {
    const [hx, hy] = pts[pts.length - 1];
    headSvg = `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${width * 2.4}" fill="${C.redHot}" filter="url(#glow)"/>`;
  }
  const [sx, sy] = pts[0];
  const origin = `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${width * 1.4}" fill="${color}"/>`;
  return origin + segs.join('') + headSvg;
}

// Where the missiles come from and go to (approximate; for illustration).
const SITES = {
  us: { // Minuteman fields in the early 1980s
    malmstrom: [-111.2, 47.5], minot: [-101.4, 48.4], grandForks: [-97.4, 47.96],
    warren: [-104.9, 41.15], ellsworth: [-103.1, 44.15], whiteman: [-93.55, 38.73],
  },
  sea: { // submarine patrol areas
    norwegianSea: [2, 70], northAtlantic: [-30, 55], northPacific: [-160, 45], barentsApproach: [20, 74],
  },
  soviet: {
    moscow: [37.6, 55.75], leningrad: [30.3, 59.94], kiev: [30.5, 50.45], minsk: [27.6, 53.9],
    kozelsk: [35.8, 54.0], tatishchevo: [45.6, 51.7], dombarovsky: [59.5, 50.8], kartaly: [60.6, 53.05],
    aleysk: [82.8, 52.5], uzhur: [89.8, 55.3], zhangizTobe: [81.2, 49.2], kostroma: [40.9, 57.8],
    teykovo: [40.5, 56.9], yoshkarOla: [47.9, 56.6], plesetsk: [40.3, 62.7], murmansk: [33.1, 68.97],
    sverdlovsk: [60.6, 56.8], kuibyshev: [50.1, 53.2], gorky: [44.0, 56.3], kharkov: [36.2, 50.0],
    omsk: [73.4, 55.0], novosibirsk: [82.9, 55.0], krasnoyarsk: [92.9, 56.0], irkutsk: [104.3, 52.3],
    khabarovsk: [135.1, 48.5], vladivostok: [131.9, 43.1], riga: [24.1, 56.95], odessa: [30.7, 46.5],
  },
};

// Deterministic pseudo-random numbers, so every render is identical.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

module.exports = { makeProjection, baseMap, labelAt, arc, SITES, rng, ussr, usa };
