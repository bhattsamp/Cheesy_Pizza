// Renders the Cheesy Pizza icons, splash screens and loading-screen pictures for both apps
// Run: PLAYWRIGHT_PATH=... node scripts/app-look/gen.js android/app/src   (the slice and colours are in slice.js and make.js)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const make = require('./make.js');
const RES = process.argv[2]; // .../android/app/src
const DENS = { ldpi: .75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const FONT = `font-family:'Inter Display','Inter',sans-serif;font-weight:900`;
const word = admin => `<div style="${FONT};color:#fff;font-size:118px;letter-spacing:-2px;line-height:1;text-shadow:0 6px 0 rgba(0,0,0,.18)">Cheesy <span style="color:#FFC93C">Pizza</span></div>` +
  (admin ? `<div style="margin-top:22px;display:inline-block;${FONT};font-size:40px;letter-spacing:8px;color:#141618;background:#F2B632;border-radius:40px;padding:8px 30px 8px 38px">ADMIN</div>` : '');
async function shot(page, html, w, h, file, transparent) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;${transparent ? 'background:transparent' : ''}">${html}</body></html>`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: !!transparent });
}
const svgFill = (svg, extra = '') => svg.replace('<svg ', `<svg preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;${extra}" `);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage();
  for (const admin of [false, true]) {
    const res = path.join(RES, admin ? 'admin' : 'main', 'res');
    for (const [d, k] of Object.entries(DENS)) {
      const L = Math.round(48 * k), A = Math.round(108 * k);
      const full = svgFill(make({ admin }));
      await shot(page, `<div style="position:relative;width:${L}px;height:${L}px;border-radius:${L * .22}px;overflow:hidden">${full}</div>`, L, L, `${res}/mipmap-${d}/ic_launcher.png`, true);
      await shot(page, `<div style="position:relative;width:${L}px;height:${L}px;border-radius:50%;overflow:hidden">${full}</div>`, L, L, `${res}/mipmap-${d}/ic_launcher_round.png`, true);
      await shot(page, `<div style="position:relative;width:${A}px;height:${A}px">${svgFill(make({ what: 'bg', admin }))}</div>`, A, A, `${res}/mipmap-${d}/ic_launcher_background.png`);
      await shot(page, `<div style="position:relative;width:${A}px;height:${A}px">${svgFill(make({ what: 'fg', admin, scale: .6 }))}</div>`, A, A, `${res}/mipmap-${d}/ic_launcher_foreground.png`, true);
    }
    // Splash screens (Android 11 and older) in every size the project already has
    for (const f of fs.readdirSync(path.join(RES, 'main', 'res')).filter(x => x.startsWith('drawable'))) {
      const src = path.join(RES, 'main', 'res', f, 'splash.png');
      if (!fs.existsSync(src)) continue;
      const { w, h } = await page.evaluate(async u => { const i = new Image(); i.src = u; await i.decode(); return { w: i.width, h: i.height }; }, 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'));
      const m = Math.min(w, h), sc = m / 1000;
      await shot(page, `<div style="position:relative;width:${w}px;height:${h}px">${svgFill(make({ what: 'bg', admin }))}
        <div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) scale(${sc});display:flex;flex-direction:column;align-items:center;width:1000px">
          <div style="width:560px;height:560px;position:relative">${svgFill(make({ what: 'fg', admin: false, scale: 1 }))}</div>
          <div style="text-align:center;margin-top:-10px">${word(admin)}</div></div></div>`, w, h, `${res}/${f}/splash.png`);
    }
    // Pictures for our own animated loading screen
    await shot(page, `<div style="position:relative;width:1080px;height:1920px">${svgFill(make({ what: 'bg', admin }))}</div>`, 1080, 1920, `${res}/drawable-nodpi/loading_bg.png`);
    await shot(page, `<div style="text-align:center;width:900px;padding:10px 0">${word(admin)}</div>`, 900, admin ? 220 : 140, `${res}/drawable-nodpi/loading_title.png`, true);
  }
  await shot(page, `<div style="position:relative;width:720px;height:720px">${svgFill(make({ what: 'fg', admin: false, scale: 1 }))}</div>`, 720, 720, `${RES}/main/res/drawable-nodpi/loading_slice.png`, true);
  await b.close();
})();
