// Episode 1's other original graphics.
//   node episode1_graphics.js <out-dir>
// Writes:
//   map-pershing-range.png        Pershing II range from West Germany
//   oko-satellite-graphic.png     the Oko satellite watching US missile fields
//   oko-false-alarm-graphic.png   the same scene with sunlight glinting off high cloud
//   chain-of-command-graphic.png  Petrov -> high command -> Soviet leader
//   launch-screen-recreation.mp4  the warning panel: one launch, then five

const path = require('path');
const fs = require('fs');
const d3 = require('d3-geo');
const { W, H, FPS, C, svgDoc, text, tag, renderVideo, writePng } = require('./common');
const { baseMap, SITES, ussr } = require('./maps');

const out = process.argv[2] || 'out';
fs.mkdirSync(out, { recursive: true });

// --- Pershing II range ------------------------------------------------------
// Range about 1,770 km (to verify), drawn from Mutlangen, one of the deployment sites.
function pershing() {
  const proj = d3.geoAzimuthalEquidistant().rotate([-25, -52]).scale(1500).translate([1250, 560]).clipAngle(40);
  const p = d3.geoPath(proj);
  const base = [9.87, 48.82]; // Mutlangen, West Germany
  const range = d3.geoCircle().center(base).radius((1770 / 6371) * (180 / Math.PI)).precision(1)();
  const [bx, by] = proj(base);
  const [mx, my] = proj(SITES.soviet.moscow);
  const body = baseMap(proj) +
    `<path d="${p(range)}" fill="${C.red}" fill-opacity="0.10" stroke="${C.red}" stroke-width="3" stroke-dasharray="14 10"/>` +
    `<line x1="${bx}" y1="${by}" x2="${mx}" y2="${my}" stroke="${C.bone}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="4 8"/>` +
    `<circle cx="${bx}" cy="${by}" r="9" fill="${C.red}"/>` +
    text(bx - 18, by + 44, 'WEST GERMANY', { size: 20, weight: 600, fill: C.bone, anchor: 'end', spacing: 0.2, opacity: 0.85 }) +
    `<circle cx="${mx}" cy="${my}" r="6" fill="${C.bone}"/>` +
    text(mx + 16, my + 8, 'MOSCOW', { size: 20, weight: 600, fill: C.bone, spacing: 0.2, opacity: 0.85 }) +
    text(proj([48, 60])[0], proj([48, 60])[1], 'SOVIET UNION', { size: 26, weight: 600, fill: C.bone, opacity: 0.55, anchor: 'middle', spacing: 0.3 }) +
    text(96, 128, 'PERSHING II', { size: 22, weight: 500, fill: C.dim, spacing: 0.22 }) +
    text(96, 236, 'UNDER', { size: 40, weight: 600, fill: C.red, spacing: 0.05 }) +
    text(96, 330, '10 MIN', { size: 104, weight: 600, fill: C.red, spacing: 0.02 }) +
    text(96, 384, 'FROM LAUNCH TO TARGET', { size: 22, weight: 500, fill: C.dim, spacing: 0.18 }) +
    text(96, 470, 'RANGE: ABOUT 1,770 KM', { size: 22, weight: 500, fill: C.bone, spacing: 0.18, opacity: 0.85 }) +
    `<line x1="96" y1="500" x2="150" y2="500" stroke="${C.red}" stroke-width="3" stroke-dasharray="14 10"/>` +
    tag('ILLUSTRATION');
  return svgDoc(body);
}

// --- Oko ----------------------------------------------------------------------
// A globe seen from space, with the satellite high above, looking at the US missile
// fields edge-on against the darkness of space.
function oko({ glint = false } = {}) {
  const cx = 960, cy = 760, R = 560;
  const proj = d3.geoOrthographic().rotate([100, -20, 0]).scale(R).translate([cx, cy]).clipAngle(90).precision(0.3);
  const p = d3.geoPath(proj);
  const graticule = d3.geoGraticule().step([20, 20])();
  const field = SITES.us.malmstrom;
  const [fx, fy] = proj(field);
  const sat = [1520, 210];
  const sun = [1850, 640];
  const ussrPath = p(ussr);
  let body = `
<circle cx="${cx}" cy="${cy}" r="${R + 18}" fill="${C.bone}" fill-opacity="0.025"/>
<path d="${p({ type: 'Sphere' })}" fill="#11100F" stroke="${C.bone}" stroke-opacity="0.18" stroke-width="2"/>
<path d="${p(graticule)}" fill="none" stroke="${C.bone}" stroke-opacity="0.06" stroke-width="1"/>
${baseMap(proj, { highlight: true }).split('\n').slice(3).join('\n')}
${ussrPath ? '' : ''}
<ellipse cx="${(cx + sat[0]) / 2 + 40}" cy="${(cy + sat[1]) / 2 - 20}" rx="760" ry="330" transform="rotate(-24 ${(cx + sat[0]) / 2 + 40} ${(cy + sat[1]) / 2 - 20})" fill="none" stroke="${C.bone}" stroke-opacity="0.25" stroke-width="1.5" stroke-dasharray="3 9"/>
<line x1="${sat[0]}" y1="${sat[1]}" x2="${fx}" y2="${fy}" stroke="${glint ? C.redHot : C.bone}" stroke-opacity="${glint ? 0.9 : 0.55}" stroke-width="2" stroke-dasharray="10 8"/>
<g transform="translate(${sat[0]} ${sat[1]}) rotate(-24)">
  <rect x="-16" y="-12" width="32" height="24" fill="${C.bone}"/>
  <rect x="-74" y="-7" width="50" height="14" fill="none" stroke="${C.bone}" stroke-width="2"/>
  <rect x="24" y="-7" width="50" height="14" fill="none" stroke="${C.bone}" stroke-width="2"/>
  <line x1="-24" y1="0" x2="-16" y2="0" stroke="${C.bone}" stroke-width="2"/>
  <line x1="16" y1="0" x2="24" y2="0" stroke="${C.bone}" stroke-width="2"/>
</g>
<circle cx="${fx}" cy="${fy}" r="8" fill="${C.red}"/>
${text(fx - 22, fy + 46, 'US MISSILE FIELDS', { size: 20, weight: 600, fill: C.bone, anchor: 'middle', spacing: 0.2, opacity: 0.85 })}
${text(sat[0] + 10, sat[1] - 52, 'OKO', { size: 30, weight: 600, fill: C.bone, anchor: 'middle', spacing: 0.3 })}`;

  if (glint) {
    const rays = [-0.06, 0, 0.06].map((d) => {
      const tx = fx + 6, ty = fy - 4 + d * 400;
      return `<line x1="${sun[0]}" y1="${sun[1] + d * 900}" x2="${tx}" y2="${ty}" stroke="#F2C14E" stroke-opacity="0.45" stroke-width="2"/>`;
    }).join('');
    body += `
${rays}
<circle cx="${sun[0]}" cy="${sun[1]}" r="46" fill="#F2C14E" fill-opacity="0.9" filter="url(#glow)"/>
${text(sun[0] - 70, sun[1] + 100, 'SUN', { size: 20, weight: 600, fill: '#F2C14E', anchor: 'middle', spacing: 0.3, opacity: 0.9 })}
<circle cx="${fx + 6}" cy="${fy - 4}" r="22" fill="#FFFFFF" fill-opacity="0.85" filter="url(#glow)"/>
${text(96, 128, 'THE FALSE ALARM', { size: 22, weight: 500, fill: C.dim, spacing: 0.22 })}
${text(96, 210, 'SUNLIGHT', { size: 64, weight: 600, fill: C.red, spacing: 0.02 })}
${text(96, 280, 'ON HIGH CLOUD', { size: 64, weight: 600, fill: C.red, spacing: 0.02 })}
${text(96, 334, 'THAT THE SATELLITES READ', { size: 22, weight: 500, fill: C.dim, spacing: 0.18 })}
${text(96, 368, 'AS ROCKET EXHAUST', { size: 22, weight: 500, fill: C.dim, spacing: 0.18 })}`;
  } else {
    body += `
${text(96, 128, 'SOVIET EARLY WARNING', { size: 22, weight: 500, fill: C.dim, spacing: 0.22 })}
${text(96, 236, 'OKO', { size: 112, weight: 600, fill: C.red, spacing: 0.04 })}
${text(96, 290, '"EYE" IN RUSSIAN', { size: 22, weight: 500, fill: C.dim, spacing: 0.18 })}
${text(96, 360, 'SATELLITES IN HIGH ORBIT,', { size: 22, weight: 500, fill: C.bone, spacing: 0.18, opacity: 0.85 })}
${text(96, 394, 'WATCHING FOR THE FLARE', { size: 22, weight: 500, fill: C.bone, spacing: 0.18, opacity: 0.85 })}
${text(96, 428, 'OF A ROCKET ENGINE', { size: 22, weight: 500, fill: C.bone, spacing: 0.18, opacity: 0.85 })}`;
  }
  return svgDoc(body + tag('ILLUSTRATION'));
}

// --- Chain of command ---------------------------------------------------------
function chain() {
  const boxes = [
    ['SERPUKHOV-15', 'Petrov, duty officer', true],
    ['HIGH COMMAND', 'Soviet military leadership', false],
    ['SOVIET LEADER', 'Yuri Andropov', false],
    ['RETALIATION', 'Launch in return?', false],
  ];
  const bw = 340, bh = 170, gap = 86, y = 430;
  const total = boxes.length * bw + (boxes.length - 1) * gap;
  const x0 = (W - total) / 2;
  let body = text(W / 2, 250, 'IF THE SATELLITES SAW A LAUNCH', { size: 24, weight: 500, fill: C.dim, anchor: 'middle', spacing: 0.22 });
  boxes.forEach(([title, sub, hot], k) => {
    const x = x0 + k * (bw + gap);
    const last = k === boxes.length - 1;
    body += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${hot ? '#1E1513' : '#151413'}" stroke="${hot || last ? C.red : C.bone}" stroke-opacity="${hot || last ? 1 : 0.45}" stroke-width="${hot ? 3 : 2}"/>`;
    body += text(x + bw / 2, y + 78, title, { size: 28, weight: 600, fill: last ? C.red : C.bone, anchor: 'middle', spacing: 0.12 });
    body += `<text x="${x + bw / 2}" y="${y + 120}" font-family="IBM Plex Mono" font-size="20" font-weight="400" fill="${C.dim}" text-anchor="middle">${sub}</text>`;
    if (!last) {
      const ax = x + bw + 14, ay = y + bh / 2;
      body += `<line x1="${ax}" y1="${ay}" x2="${ax + gap - 34}" y2="${ay}" stroke="${C.bone}" stroke-opacity="0.6" stroke-width="2.5"/>`;
      body += `<path d="M ${ax + gap - 34} ${ay - 9} L ${ax + gap - 20} ${ay} L ${ax + gap - 34} ${ay + 9} Z" fill="${C.bone}" fill-opacity="0.6"/>`;
    }
  });
  // "Minutes" bracket under the last two steps.
  const bx1 = x0 + 2 * (bw + gap), bx2 = x0 + 4 * bw + 3 * gap, by = y + bh + 50;
  body += `<path d="M ${bx1} ${by} L ${bx1} ${by + 22} L ${bx2} ${by + 22} L ${bx2} ${by}" fill="none" stroke="${C.red}" stroke-width="2.5"/>`;
  body += text((bx1 + bx2) / 2, by + 80, 'ONLY MINUTES TO DECIDE', { size: 24, weight: 600, fill: C.red, anchor: 'middle', spacing: 0.2 });
  return svgDoc(body + tag('ILLUSTRATION'));
}

// --- Launch screen --------------------------------------------------------------
// The warning panel at Serpukhov-15, recreated: dark, then СТАРТ (LAUNCH) blinking,
// with the count rising from 1 to 5 on the same timing as the five-missile map.
const ALERTS = [1.0, 2.8, 4.6, 6.4, 8.2];
function launchFrame(i) {
  const t = i / FPS;
  const n = ALERTS.filter((a) => t >= a).length;
  const alarm = n > 0;
  const blinkOn = alarm && (t - ALERTS[0]) % 0.8 < 0.55;
  const panelX = 360, panelY = 170, pw = 1200, ph = 620;
  let body = `
<rect x="${panelX}" y="${panelY}" width="${pw}" height="${ph}" rx="10" fill="#141210" stroke="${C.bone}" stroke-opacity="0.18" stroke-width="2"/>
<rect x="${panelX + 60}" y="${panelY + 70}" width="${pw - 120}" height="300" rx="6" fill="${blinkOn ? '#3A0F0A' : '#1A1311'}" stroke="${alarm ? C.red : C.bone}" stroke-opacity="${alarm ? 0.9 : 0.2}" stroke-width="3"/>`;
  if (blinkOn) {
    body += `<text x="${W / 2}" y="${panelY + 270}" font-family="IBM Plex Mono" font-size="190" font-weight="700" fill="${C.redHot}" text-anchor="middle" letter-spacing="30" filter="url(#glow)">СТАРТ</text>`;
  } else {
    body += `<text x="${W / 2}" y="${panelY + 270}" font-family="IBM Plex Mono" font-size="190" font-weight="700" fill="${C.red}" fill-opacity="0.12" text-anchor="middle" letter-spacing="30">СТАРТ</text>`;
  }
  body += text(W / 2, panelY + 420, alarm ? 'LAUNCH' : '', { size: 30, weight: 600, fill: C.bone, anchor: 'middle', spacing: 0.5, opacity: 0.75 });
  body += text(panelX + 80, panelY + 520, 'RELIABILITY', { size: 24, weight: 500, fill: C.dim, spacing: 0.2 });
  body += text(panelX + 80, panelY + 562, alarm ? 'HIGHEST' : '—', { size: 32, weight: 600, fill: alarm ? C.red : C.dim, spacing: 0.16 });
  body += text(panelX + pw - 80, panelY + 520, 'MISSILES', { size: 24, weight: 500, fill: C.dim, anchor: 'end', spacing: 0.2 });
  body += text(panelX + pw - 80, panelY + 568, String(n), { size: 54, weight: 600, fill: alarm ? C.red : C.dim, anchor: 'end' });
  return svgDoc(body + tag('RECREATION'));
}

(async () => {
  writePng(path.join(out, 'map-pershing-range.png'), pershing());
  writePng(path.join(out, 'oko-satellite-graphic.png'), oko());
  writePng(path.join(out, 'oko-false-alarm-graphic.png'), oko({ glint: true }));
  writePng(path.join(out, 'chain-of-command-graphic.png'), chain());
  writePng(path.join(out, 'launch-screen-preview.png'), launchFrame(Math.round(8.5 * FPS)));
  if (process.argv.includes('--stills')) return;
  // Render 12 seconds, then loop the last 2.4 s (three blink cycles) to make a 31 s clip.
  // Rendering every frame of 30 s in one go runs out of memory.
  const part = path.join(out, 'launch-screen-part.mp4');
  await renderVideo(part, 12 * FPS, launchFrame);
  const final = path.join(out, 'launch-screen-recreation.mp4');
  require('child_process').execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', part,
    '-filter_complex', '[0]split[a][b];[b]trim=9.6:12,setpts=PTS-STARTPTS,loop=loop=7:size=72[t];[a][t]concat=n=2:v=1[v]',
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final]);
  fs.unlinkSync(part);
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
