// Builds www/ for the offline app: the site's index.html with the starting data and a
// local stand-in for the /api server injected ahead of the app script, plus the photos.
// Used when the app is built without CHEESY_SERVER_URL.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WWW = path.join(__dirname, '..', 'www');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const seed = fs.readFileSync(path.join(ROOT, 'server', 'seed-data.js'), 'utf8')
  .replace(/^module\.exports.*$/m, '');
const shim = fs.readFileSync(path.join(__dirname, 'offline-api.js'), 'utf8');

const appScript = html.indexOf('<script>');
if (appScript < 0) throw new Error('No inline <script> found in index.html');
const inject = `<script>\nconst seedData=(()=>{\n${seed}\nreturn seedData})();\n${shim}</script>\n`;

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
fs.writeFileSync(path.join(WWW, 'index.html'), html.slice(0, appScript) + inject + html.slice(appScript));
fs.cpSync(path.join(ROOT, 'img'), path.join(WWW, 'img'), { recursive: true });
console.log('Built offline app in www/');
