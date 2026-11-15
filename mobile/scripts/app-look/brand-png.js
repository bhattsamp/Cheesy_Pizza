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
  // Layouts the site uses (same file names as before, so every page picks them up):
  // logo-lockup.png  pin beside the name, for the site header
  // logo-stack-light.png  pin over the name in white, for dark backgrounds (footer, Shop display, order screens)
  // logo-badge.png  the full logo on a white disc (home page, e-bill, Shop display)
  const inner = f => { const t = fs.readFileSync(path.join(IMG, f), 'utf8'); return { vb: t.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number), body: t.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') }; };
  const at = (f, x, y, h) => { const { vb, body } = inner(f), w = h * vb[2] / vb[3]; return { svg: `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb.join(' ')}">${body}</svg>`, w }; };
  const shotSvg = async (w, h, body, out) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">${body}</svg></body>`);
    await page.screenshot({ path: path.join(IMG, out), omitBackground: true }); console.log(out, w + 'x' + h);
  };
  { const H = 300, p = at('logo-pin.svg', 4, 0, H), k = .86;
    const x = 4 + p.w + 22, w2 = at('logo-wordmark.svg', x, (H - H * k) / 2 + 8, H * k);
    await shotSvg(Math.ceil(x + w2.w + 6), H, p.svg + w2.svg, 'logo-lockup.png'); }
  { const W = 760, p = at('logo-pin.svg', 0, 0, 470), wmH = 470 * 305 / 904 * 1.15, wm = at('logo-wordmark-white.svg', 0, 0, wmH);
    const px = (W - p.w) / 2, wx = (W - wm.w) / 2;
    await shotSvg(W, Math.ceil(470 + 28 + wmH), at('logo-pin.svg', px, 0, 470).svg + at('logo-wordmark-white.svg', wx, 470 + 28, wmH).svg, 'logo-stack-light.png'); }
  { const S = 820, L = at('logo.svg', 0, 0, 600), x = (S - L.w) / 2;
    await shotSvg(S, S, `<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2 - 18}" fill="#fff"/><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2 - 8}" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="60 18 120 26 40 14" opacity=".85"/>` + at('logo.svg', x, (S - 600) / 2, 600).svg, 'logo-badge.png'); }
  await b.close();
})();
