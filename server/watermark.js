// Public copies of our food photos: the same picture with the Cheesy Pizza logo printed across it
// and no bigger than 900px, so a photo saved from the customer site is not a clean copy.
// The originals stay as they are for the till, the admin screens and the shop TV.
const path = require('path');
const sharp = require('sharp');

const MAX_SIDE = 900;
const LOGO = path.join(__dirname, '..', 'img', 'logo-pin-white.png');
const CACHE_MAX = 300; // finished copies kept in memory (a menu photo is about 30–80 KB)
const cache = new Map();
let logoRaw = null;

async function logoBuf() {
  if (!logoRaw) logoRaw = await sharp(LOGO).toBuffer();
  return logoRaw;
}

// One logo, sized w wide, as a white mark with a soft dark edge so it shows on light and dark food alike
async function mark(w) {
  const white = await sharp(await logoBuf()).resize({ width: w }).linear([1, 1, 1, 0.36], [0, 0, 0, 0]).toBuffer();
  const meta = await sharp(white).metadata();
  const pad = Math.round(w * 0.12);
  const shadow = await sharp(await logoBuf()).resize({ width: w }).negate({ alpha: false })
    .linear([1, 1, 1, 0.24], [0, 0, 0, 0]).blur(Math.max(1, w / 40)).toBuffer();
  return sharp({ create: { width: meta.width + pad * 2, height: meta.height + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, left: pad + 1, top: pad + 2 }, { input: white, left: pad, top: pad }])
    .png().toBuffer();
}

// A square tile with two logos on a diagonal; repeated over the photo it gives a staggered pattern
async function tile(side) {
  const m = await mark(Math.round(side * 0.34));
  const mm = await sharp(m).metadata();
  const q = Math.round(side / 4);
  const at = (cx, cy) => ({ input: m, left: Math.max(0, Math.round(cx - mm.width / 2)), top: Math.max(0, Math.round(cy - mm.height / 2)) });
  return sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([at(q, q), at(q * 3, q * 3)]).png().toBuffer();
}

async function watermark(buf, type) {
  const img = sharp(buf, { animated: false }).rotate();
  const meta = await img.metadata();
  const scale = Math.min(1, MAX_SIDE / Math.max(meta.width || 1, meta.height || 1));
  const w = Math.max(1, Math.round((meta.width || 1) * scale)), h = Math.max(1, Math.round((meta.height || 1) * scale));
  const side = Math.max(140, Math.round(Math.min(w, h) * 0.5));
  const base = await img.resize(w, h).ensureAlpha().toBuffer();
  // 'atop' prints the logos only where the photo has pixels, so cut-out photos keep a clean outline
  const out = sharp(base).composite([{ input: await tile(side), tile: true, blend: 'atop' }]);
  if (meta.hasAlpha) return { type: 'image/webp', data: await out.webp({ quality: 76 }).toBuffer() };
  return { type: 'image/jpeg', data: await out.flatten({ background: '#ffffff' }).jpeg({ quality: 74, mozjpeg: true }).toBuffer() };
}

// key: anything that changes when the photo changes (its path and file time, or its upload id)
async function publicCopy(key, load) {
  if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
  const src = await load();
  if (!src) return null;
  const v = await watermark(src.data, src.type);
  cache.set(key, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return v;
}

module.exports = { publicCopy, watermark };
