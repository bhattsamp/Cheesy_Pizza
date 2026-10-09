// Builds the shared claude.ai artifact (artifact/index.html + img/): the site with the
// starting data, a stand-in for the /api server backed by the artifact's shared database,
// and the customer/owner app chooser. Publish it with the db and user capabilities.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'artifact');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const seed = fs.readFileSync(path.join(ROOT, 'server', 'seed-data.js'), 'utf8')
  .replace(/^module\.exports.*$/m, '');
const shim = fs.readFileSync(path.join(__dirname, 'shared-api.js'), 'utf8');
const chooser = fs.readFileSync(path.join(__dirname, 'app-chooser.js'), 'utf8');

const css = `<style>
#chooser{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:16px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(6px);animation:chIn .35s ease}
@keyframes chIn{from{opacity:0}}
.ch-card{width:min(420px,100%);background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:24px 20px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.18)}
.ch-logo{width:56px;height:56px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;background:var(--teal);color:var(--teal-ink);font:800 28px var(--display)}
.ch-card h2{font-size:24px}.ch-card>p{color:var(--muted);margin:6px 0 16px}
.ch-opt{display:grid;grid-template-columns:44px 1fr;grid-template-rows:auto auto;column-gap:12px;align-items:center;text-align:left;width:100%;margin:0 0 10px;padding:14px;border-radius:16px;border:2px solid var(--line);background:var(--surface2);color:var(--ink);cursor:pointer;font:inherit;transition:transform .15s,border-color .15s}
.ch-opt:hover,.ch-opt:focus-visible{border-color:var(--teal);transform:translateY(-2px)}
.ch-opt span{grid-row:1/3;font-size:32px;text-align:center}.ch-opt b{font-family:var(--display);font-size:18px}.ch-opt small{color:var(--muted)}
.ch-note{font-size:13px;color:var(--muted);margin:6px 0 0}
body.role-customer .seg{display:none}
body.role-customer:not(.can-own) [data-act="mode"][data-v="pos"]{display:none}
#swapApp{display:block;margin:24px auto 32px}
#viewonly{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:150;max-width:calc(100% - 32px);padding:8px 14px;border-radius:12px;background:var(--cheese-soft);color:var(--cheese-ink);font-size:14px;text-align:center}
</style>
`;

const appScript = html.indexOf('<script>');
if (appScript < 0) throw new Error('No inline <script> found in index.html');
html = html.slice(0, appScript) + `<script>\nconst seedData=(()=>{\n${seed}\nreturn seedData})();\n${shim}</script>\n` + html.slice(appScript);
html = html.replace('<title>Cheesy Pizza POS</title>', '<title>Cheesy Pizza Live</title>');
html = html.replace('</head>', css + '</head>');
// The server message does not apply here: say what the shared database reported instead
html = html.replace(/<h2>Can\\'t reach the Cheesy Pizza server<\/h2><p class="muted">.*?<\/p>/,
  `<h2>Cheesy Pizza is not ready</h2><p class="muted">'+esc(window.CHEESY_SHARED.err||'Could not load the shop. Reload to try again.')+'</p>`);
const end = html.lastIndexOf('</body>');
html = html.slice(0, end) + `<script>\n${chooser}</script>\n` + html.slice(end);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.cpSync(path.join(ROOT, 'img'), path.join(OUT, 'img'), { recursive: true });
console.log('Built shared artifact in artifact/');
