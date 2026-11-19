// Records promo.html into MP4 videos, frame by frame (so every frame is perfect, however slow the computer):
//   cheesy-pizza-promo-16x9.mp4  (1920x1080, for the shop TV, YouTube)
//   cheesy-pizza-promo-9x16.mp4  (1080x1920, for Instagram Reels, WhatsApp Status, YouTube Shorts)
// Needs Node, Playwright with Chromium, and ffmpeg. Start the site (npm start), then:
//   node tools/promo-video.js http://localhost:3000 out/
// Optional FONTS=<folder with anton.woff2 and courgette.woff2> when the computer cannot reach Google Fonts.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.argv[3] || '.';
const FPS = 30;

async function record(tall, file) {
  const W = tall ? 1080 : 1920, H = tall ? 1920 : 1080;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  if (process.env.FONTS) {
    const f = n => 'data:font/woff2;base64,' + fs.readFileSync(path.join(process.env.FONTS, n)).toString('base64');
    await p.route(/fonts\.googleapis\.com/, r => r.fulfill({ contentType: 'text/css',
      body: `@font-face{font-family:Anton;src:url(${f('anton.woff2')})}@font-face{font-family:Courgette;src:url(${f('courgette.woff2')})}` }));
  }
  await p.goto(`${BASE}/promo.html?capture=1${tall ? '&v=1' : ''}`, { waitUntil: 'load' });
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
  await record(false, 'cheesy-pizza-promo-16x9.mp4');
  await record(true, 'cheesy-pizza-promo-9x16.mp4');
})();
