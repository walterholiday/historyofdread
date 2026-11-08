// Shared look and helpers for History of Dread graphics.
// Renders SVG strings to PNG with resvg, and pipes frames into ffmpeg.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Resvg } = require('@resvg/resvg-js');

const W = 1920;
const H = 1080;
const FPS = 30;

const C = {
  ground: '#0E0D0C',
  land: '#1A1816',
  landHi: '#262220',
  bone: '#E9E2D2',
  dim: '#9C9384',
  red: '#C8321F',
  redHot: '#FF5A3C',
};

const FONT_DIR = path.join(__dirname, 'node_modules/@expo-google-fonts/ibm-plex-mono');
const FONTS = ['400Regular', '500Medium', '600SemiBold', '700Bold']
  .map((w) => path.join(FONT_DIR, w, `IBMPlexMono_${w}.ttf`))
  .filter((f) => fs.existsSync(f));
const MONO = "IBM Plex Mono";

function toPng(svg, width = W) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: MONO },
    background: C.ground,
  });
  return r.render().asPng();
}

function svgDoc(body, { w = W, h = H, defs = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="6" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.5"/>
  </filter>
  ${defs}
</defs>
<rect width="${w}" height="${h}" fill="${C.ground}"/>
${body}
</svg>`;
}

function text(x, y, s, { size = 28, weight = 600, fill = C.bone, anchor = 'start', spacing = 0.12, opacity = 1 } = {}) {
  const esc = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="${weight}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}" letter-spacing="${size * spacing}">${esc}</text>`;
}

// A small corner tag so viewers know a graphic is an illustration or recreation.
function tag(label) {
  return text(W - 48, H - 44, label, { size: 18, weight: 500, fill: C.dim, anchor: 'end', spacing: 0.2 });
}

// Stream frames into an MP4. renderFrame(i) returns an SVG string.
// holdSeconds clones the last frame so a shot can run long without looping.
function renderVideo(out, frames, renderFrame, { holdSeconds = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const vf = [`fps=${FPS}`, 'format=yuv420p'];
    if (holdSeconds > 0) vf.unshift(`tpad=stop_mode=clone:stop_duration=${holdSeconds}`);
    const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-vf', vf.join(','), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
      '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg exited ${code}`))));
    (async () => {
      for (let i = 0; i < frames; i++) {
        const png = toPng(renderFrame(i));
        if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
      }
      ff.stdin.end();
    })().catch(reject);
  });
}

function writePng(out, svg) {
  fs.writeFileSync(out, toPng(svg));
  return out;
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => Math.max(0, Math.min(1, t));

module.exports = { W, H, FPS, C, MONO, toPng, svgDoc, text, tag, renderVideo, writePng, ease, clamp01 };
