// Records the films into MP4 videos, frame by frame (so every frame is perfect, however slow the computer):
//   cheesy-pizza-promo-16x9.mp4  (1920x1080, for the shop TV, YouTube)        from promo.html
//   cheesy-pizza-promo-9x16.mp4  (1080x1920, for Reels, WhatsApp Status, Shorts) from promo.html
//   cheesy-pizza-menu-16x9.mp4   (1920x1080) the menu book with today's items and prices, from menu-book.html
// The last argument picks one: promo, menu or all (default).
// Needs Node, Playwright with Chromium, and ffmpeg. Start the site (npm start), then:
//   node tools/promo-video.js http://localhost:3000 out/ [promo|menu|all]
// Optional FONTS=<folder with anton.woff2 and courgette.woff2> when the computer cannot reach Google Fonts.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.argv[3] || '.';
const FPS = 30;

async function record(page, tall, file) {
  const W = tall ? 1080 : 1920, H = tall ? 1920 : 1080;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  if (process.env.FONTS) {
    const f = n => 'data:font/woff2;base64,' + fs.readFileSync(path.join(process.env.FONTS, n)).toString('base64');
    await p.route(/fonts\.googleapis\.com/, r => r.fulfill({ contentType: 'text/css',
      body: `@font-face{font-family:Anton;src:url(${f('anton.woff2')})}@font-face{font-family:Courgette;src:url(${f('courgette.woff2')})}`+
      [400, 600, 700].map(w => fs.existsSync(path.join(process.env.FONTS, `playfair-${w}.woff2`)) ? `@font-face{font-family:'Playfair Display';font-weight:${w};src:url(${f(`playfair-${w}.woff2`)})}` : '').join('')+
      [400, 500, 600].map(w => fs.existsSync(path.join(process.env.FONTS, `hind-${w}.woff2`)) ? `@font-face{font-family:'Hind Vadodara';font-weight:${w};src:url(${f(`hind-${w}.woff2`)})}` : '').join('')+`` }));
  }
  await p.goto(`${BASE}/${page}?capture=1${tall ? '&v=1' : ''}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.render && (window.READY !== false), null, { timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const dur = await p.evaluate(() => window.DUR), n = Math.round(dur * FPS);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, file)], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await p.evaluate(t => window.render(t), i / FPS);
    const jpg = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`${file}: ${Math.round(i / n * 100)}%\r`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
  console.log(`${file}: done`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const which = process.argv[4] || 'all';
  if (which === 'all' || which === 'promo') {
    await record('promo.html', false, 'cheesy-pizza-promo-16x9.mp4');
    await record('promo.html', true, 'cheesy-pizza-promo-9x16.mp4');
  }
  // the menu book is landscape (1920 x 1080), for the shop TV
  if (which === 'all' || which === 'menu') await record('menu-book.html', false, 'cheesy-pizza-menu-16x9.mp4');
})();
