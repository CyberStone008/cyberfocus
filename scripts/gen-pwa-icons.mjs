import sharp from 'sharp';
import { writeFileSync } from 'fs';

const content = (scale) => `
  <g transform="translate(256,256) scale(${scale}) translate(-256,-256)">
    <g fill="none" stroke="url(#ring)" stroke-width="18">
      <circle cx="256" cy="256" r="150" opacity="0.32"/>
      <circle cx="256" cy="256" r="104" opacity="0.6"/>
      <circle cx="256" cy="256" r="58"/>
    </g>
    <circle cx="256" cy="256" r="27" fill="#34e3ff"/>
    <g stroke="url(#ring)" stroke-width="16" stroke-linecap="round">
      <line x1="256" y1="58" x2="256" y2="98"/>
      <line x1="256" y1="414" x2="256" y2="454"/>
      <line x1="58" y1="256" x2="98" y2="256"/>
      <line x1="414" y1="256" x2="454" y2="256"/>
    </g>
  </g>`;

const svg = (scale) => `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="78%">
      <stop offset="0%" stop-color="#13233f"/>
      <stop offset="55%" stop-color="#0a0f1c"/>
      <stop offset="100%" stop-color="#05070d"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7cc4ff"/>
      <stop offset="50%" stop-color="#3b9bff"/>
      <stop offset="100%" stop-color="#1566b8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  ${content(scale)}
</svg>`;

const full = Buffer.from(svg(1));
const mask = Buffer.from(svg(0.72));

async function png(buf, size, out) { await sharp(buf, { density: 384 }).resize(size, size).png().toFile(out); console.log('  ✓', out); }

await png(full, 512, 'public/icons/icon-512.png');
await png(full, 192, 'public/icons/icon-192.png');
await png(mask, 512, 'public/icons/icon-maskable-512.png');
await png(full, 180, 'app/apple-icon.png');
await png(full, 512, 'app/icon.png');

// favicon.ico（多尺寸 PNG-in-ICO，现代浏览器全支持）——与 APP 图标同源，保持一致。
async function pngBuf(buf, size) { return sharp(buf, { density: 384 }).resize(size, size).png().toBuffer(); }
function buildIco(images /* [{size, buf}] */) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const dirs = images.map(({ size, buf }) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size >= 256 ? 0 : size, 0);
    d.writeUInt8(size >= 256 ? 0 : size, 1);
    d.writeUInt16LE(1, 4);   // planes
    d.writeUInt16LE(32, 6);  // bpp
    d.writeUInt32LE(buf.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += buf.length;
    return d;
  });
  return Buffer.concat([header, ...dirs, ...images.map((i) => i.buf)]);
}
const icoImgs = await Promise.all([16, 32, 48].map(async (s) => ({ size: s, buf: await pngBuf(full, s) })));
writeFileSync('app/favicon.ico', buildIco(icoImgs));
console.log('  ✓ app/favicon.ico');
console.log('done');
