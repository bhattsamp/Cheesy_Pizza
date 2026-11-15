// The Cheesy Pizza brand mark for the app pictures: the pin from img/logo-pin.svg (traced by brand.py),
// placed in a 1024 canvas with its circle centred at (512, 392), radius 300, tip near y 947.
// part: 'all' or 'body' (the pin), 'drips' and 'drop' (empty: the pin has no cheese drips, so the
// loading screen shows the pin alone). Pages that set the name in text need fontFaces().
const fs = require('fs'), path = require('path');
const IMG = path.join(__dirname, '..', '..', '..', 'img');
const fontFaces = () => ['Fredoka', 'Courgette', 'Dosis'].map(f => `@font-face{font-family:'${f}';font-weight:100 900;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f + '.woff2')).toString('base64')}) format('woff2')}`).join('');
const cx = 512, cy = 392, R = 300;
// An SVG file from img/ as a nested <svg> at x, y, width, height (in the parent's units)
const place = (file, x, y, w, h) => {
  const src = fs.readFileSync(path.join(IMG, file), 'utf8');
  const vb = src.match(/viewBox="([^"]+)"/)[1];
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}">${src.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>`;
};
// brand.py gives the pin's viewBox 6 units of space round it: the circle's width is the viewBox width less
// 12, and the circle touches the top
const pinAt = file => {
  const [vx, vy, vw, vh] = fs.readFileSync(path.join(IMG, file), 'utf8').match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const r = (vw - 12) / 2, pcx = vx + vw / 2, pcy = vy + 6 + r, k = R / r;
  return place(file, (cx - (pcx - vx) * k).toFixed(1), (cy - (pcy - vy) * k).toFixed(1), (vw * k).toFixed(1), (vh * k).toFixed(1));
};
const logo = ({ part = 'all', white = false } = {}) => part === 'drips' || part === 'drop' ? '' : pinAt(white ? 'logo-pin-white.svg' : 'logo-pin.svg');
// The wordmark (CHEESY PIZZA(TM) and "Really Cheesy...!") as an inline SVG of the given width
const wordmark = (width, white = false) => {
  const src = fs.readFileSync(path.join(IMG, white ? 'logo-wordmark-white.svg' : 'logo-wordmark.svg'), 'utf8');
  const [, , vw, vh] = src.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  return src.replace('<svg ', `<svg width="${width}" height="${Math.round(width * vh / vw)}" style="display:block;margin:0 auto" `);
};
module.exports = logo;
module.exports.fontFaces = fontFaces;
module.exports.wordmark = wordmark;
module.exports.DRIP_TOP = cy + 190;
