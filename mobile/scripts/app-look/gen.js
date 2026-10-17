// Renders the Cheesy Pizza icons, splash screens and loading-screen pictures for both apps
// Run: PLAYWRIGHT_PATH=... node scripts/app-look/gen.js android/app/src   (shapes: logo.js, wedge.js, make.js)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const look = require('./make.js'), wedge = require('./wedge.js');
const RES = process.argv[2];
const DENS = { ldpi: .75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const FONT = `font-family:'Fredoka',sans-serif;font-weight:700`;
const FACES = require('./logo.js').fontFaces();
const svg = (inner, style = '') => `<svg viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;${style}">${inner}</svg>`;
// The name under the pin as on the logo: CHEESY in teal, PIZZA in orange, then "Really Cheesy...!"
// with an orange swoosh (Admin: on dark, with an ADMIN pill)
const word = admin => `<div style="${FONT};font-size:116px;letter-spacing:1px;line-height:1">` +
  `<span style="color:${admin ? '#3CC8D8' : '#1497A9'};text-shadow:0 5px 0 ${admin ? '#0B6E7C' : '#0B6E7C'}">CHEESY</span> ` +
  `<span style="color:#F7A81B;text-shadow:0 5px 0 #C97F06">PIZZA</span></div>` +
  (admin ? `<div style="margin-top:24px;display:inline-block;${FONT};font-size:40px;letter-spacing:8px;color:#141618;background:#F2B632;border-radius:40px;padding:6px 30px 6px 38px">ADMIN</div>`
    : `<div style="position:relative;display:inline-block;font-family:'Courgette',cursive;color:#0F8698;font-size:54px;margin-top:10px;padding-bottom:12px">Really Cheesy...!` +
      `<svg viewBox="0 0 300 20" style="position:absolute;left:4%;bottom:0;width:80%;height:16px"><path d="M4 14 Q150 2 296 8" stroke="#F7A81B" stroke-width="5" fill="none" stroke-linecap="round"/></svg></div>`);
async function shot(page, html, w, h, file, transparent) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><head><style>${FACES}</style></head><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;${transparent ? 'background:transparent' : ''}">${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: !!transparent });
}
const box = (w, h, inner, extra = '') => `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;${extra}">${inner}</div>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = await b.newPage();
  for (const admin of [false, true]) {
    const res = path.join(RES, admin ? 'admin' : 'main', 'res');
    for (const [d, k] of Object.entries(DENS)) {
      const L = Math.round(48 * k), A = Math.round(108 * k);
      await shot(page, box(L, L, svg(look.icon(admin)), `border-radius:${L * .22}px`), L, L, `${res}/mipmap-${d}/ic_launcher.png`, true);
      await shot(page, box(L, L, svg(look.icon(admin)), 'border-radius:50%'), L, L, `${res}/mipmap-${d}/ic_launcher_round.png`, true);
      await shot(page, box(A, A, svg(look.iconBg(admin))), A, A, `${res}/mipmap-${d}/ic_launcher_background.png`);
      await shot(page, box(A, A, svg(look.iconFg(admin))), A, A, `${res}/mipmap-${d}/ic_launcher_foreground.png`, true);
    }
    // Splash screens (Android 11 and older) in every size the project already has: the white pin and the name
    for (const f of fs.readdirSync(path.join(RES, 'main', 'res')).filter(x => x.startsWith('drawable'))) {
      const src = path.join(RES, 'main', 'res', f, 'splash.png');
      if (!fs.existsSync(src)) continue;
      const { w, h } = await page.evaluate(async u => { const i = new Image(); i.src = u; await i.decode(); return { w: i.width, h: i.height }; }, 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'));
      const sc = Math.min(w, h) / 1000;
      await shot(page, box(w, h, svg(look.screenBg(admin)) + `
        <div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) scale(${sc});display:flex;flex-direction:column;align-items:center;width:1000px">
          <div style="width:520px;height:520px;position:relative">${svg(look.pin('sp'))}</div>
          <div style="text-align:center;margin-top:-10px">${word(admin)}</div></div>`), w, h, `${res}/${f}/splash.png`);
    }
    // Pictures for the animated loading screen
    await shot(page, box(1080, 1920, svg(look.screenBg(admin))), 1080, 1920, `${res}/drawable-nodpi/loading_bg.png`);
    await shot(page, `<div style="text-align:center;width:900px;padding:14px 0">${word(admin)}</div>`, 900, admin ? 230 : 230, `${res}/drawable-nodpi/loading_title.png`, true);
  }
  await shot(page, `<svg viewBox="0 0 1024 1024" width="720" height="720">${wedge()}</svg>`, 720, 720, `${RES}/main/res/drawable-nodpi/loading_wedge.png`, true);
  // The pin without its drips, the drips and one falling drop, so the loading screen can let the cheese drip
  for (const [part, name] of [['body', 'logo'], ['drips', 'drips'], ['drop', 'drop']])
    await shot(page, `<svg viewBox="0 0 1024 1024" width="720" height="720">${look.pin('lp', part)}</svg>`, 720, 720, `${RES}/main/res/drawable-nodpi/loading_${name}.png`, true);
  await b.close();
})();
