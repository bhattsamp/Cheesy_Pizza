// Exports PNG copies of the vector logo (img/logo*.svg, made by brand.py) for places that need a picture:
// sharing, printing, app stores, WhatsApp. Run: node mobile/scripts/app-look/brand-png.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const IMG = path.join(__dirname, '..', '..', '..', 'img');
// file, width in px, background (none = transparent), square canvas
const OUT = [
  ['logo', 'logo.png', 2048], ['logo', 'logo-on-white.png', 2048, '#ffffff', true],
  ['logo-white', 'logo-white.png', 2048], ['logo-pin', 'logo-pin.png', 1024],
  ['logo-pin-white', 'logo-pin-white.png', 1024], ['logo-pin', 'logo-icon-512.png', 512, '#ffffff', true],
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = await b.newPage();
  for (const [src, out, W, bg, square] of OUT) {
    const svg = fs.readFileSync(path.join(IMG, src + '.svg'), 'utf8');
    const [, , vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const w = square ? Math.round(W * .8 * Math.min(1, vw / vh)) : W, h = Math.round(w * vh / vw);
    const cw = square ? W : w, ch = square ? W : h;
    await page.setViewportSize({ width: cw, height: ch });
    await page.setContent(`<body style="margin:0;width:${cw}px;height:${ch}px;display:grid;place-items:center;background:${bg || 'transparent'}"><div style="width:${w}px;height:${h}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`);
    await page.screenshot({ path: path.join(IMG, out), omitBackground: !bg });
    console.log(out, cw + 'x' + ch);
  }
  await b.close();
})();
