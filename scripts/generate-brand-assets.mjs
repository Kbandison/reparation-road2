// Generates favicons, app icons, PWA icons, and the social share (OG) image
// from the brand logo. Run: node scripts/generate-brand-assets.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = join(root, 'public', 'logo-reparation-road.png');
const CREAM = '#F5F0E8';
const DARK = '#0F0D0B';
const GOLD = '#C8956C';
const MUTED = '#A8A29E';

const logo = readFileSync(LOGO);

// Transparent, edge-to-edge (the badge is already circular).
async function iconPng(size) {
  return sharp(logo)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// Logo centered on a solid cream tile with padding (for iOS + maskable PWA).
async function tilePng(size, padRatio) {
  const inner = Math.round(size * (1 - padRatio));
  const badge = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: badge, gravity: 'center' }])
    .png()
    .toBuffer();
}

// A multi-size .ico wrapping PNG frames (read by all modern browsers).
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + 16 * frames.length;
  frames.forEach((f, i) => {
    const e = i * 16;
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, e + 0);
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(f.buf.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += f.buf.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.buf)]);
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function ogImage() {
  const W = 1200;
  const H = 630;
  const badgeSize = 340;
  const badge = await sharp(logo)
    .resize(badgeSize, badgeSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const textX = 470;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#14110E"/>
        <stop offset="1" stop-color="${DARK}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="0" y="0" width="${W}" height="8" fill="${GOLD}"/>
    <text x="${textX}" y="250" font-family="Georgia, 'Times New Roman', serif" font-size="74" font-weight="700" fill="${CREAM}">Reparation Road</text>
    <text x="${textX}" y="320" font-family="'DejaVu Sans', Helvetica, Arial, sans-serif" font-size="33" fill="${MUTED}">Restoring history through research</text>
    <text x="${textX}" y="366" font-family="'DejaVu Sans', Helvetica, Arial, sans-serif" font-size="33" fill="${MUTED}">and advocacy.</text>
    <text x="${textX}" y="470" font-family="'DejaVu Sans', Helvetica, Arial, sans-serif" font-size="27" font-weight="700" fill="${GOLD}">${esc('reparationroad.org')}</text>
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([{ input: badge, left: 90, top: Math.round((H - badgeSize) / 2) }])
    .png()
    .toBuffer();
}

const out = {
  [join(root, 'app', 'icon.png')]: await iconPng(256),
  [join(root, 'app', 'apple-icon.png')]: await tilePng(180, 0.12),
  [join(root, 'app', 'favicon.ico')]: buildIco([
    { size: 48, buf: await iconPng(48) },
    { size: 32, buf: await iconPng(32) },
    { size: 16, buf: await iconPng(16) },
  ]),
  [join(root, 'public', 'icon-192.png')]: await tilePng(192, 0.18),
  [join(root, 'public', 'icon-512.png')]: await tilePng(512, 0.18),
  [join(root, 'public', 'og-image.png')]: await ogImage(),
};

for (const [path, buf] of Object.entries(out)) {
  writeFileSync(path, buf);
  console.log('wrote', path.replace(root + '/', ''), `(${(buf.length / 1024).toFixed(1)} KB)`);
}
