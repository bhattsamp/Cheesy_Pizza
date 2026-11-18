const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createApp } = require('../server/server');

// Public (logo-marked) copies of photos for the customer site. Runs without MongoDB: a stand-in store.
async function withServer(fn) {
  const photo = await sharp(path.join(__dirname, '..', 'img', 'margherita.jpg')).toBuffer();
  const files = new Map([['ph1', { type: 'image/jpeg', data: photo }], ['vd1', { type: 'video/mp4', data: Buffer.from('x') }]]);
  const server = createApp({ async getImage(id) { return files.get(id) || null; } }).listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`, photo); } finally { server.close(); }
}

test('menu photos have a public copy that differs from the original', () => withServer(async base => {
  const orig = fs.readFileSync(path.join(__dirname, '..', 'img', 'margherita.jpg'));
  const r = await fetch(base + '/p/img/margherita.jpg');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.notDeepEqual(buf, orig);
  const m = await sharp(buf).metadata();
  assert.ok(Math.max(m.width, m.height) <= 900);
  assert.equal((await fetch(base + '/p/img/..%2fserver%2fdb.js')).status, 404);
  assert.equal((await fetch(base + '/p/img/nope.jpg')).status, 404);
}));

test('uploaded photos have a public copy; videos are passed through', () => withServer(async (base, photo) => {
  const r = await fetch(base + '/p/api/images/ph1');
  assert.equal(r.status, 200);
  assert.notDeepEqual(Buffer.from(await r.arrayBuffer()), photo);
  const v = await fetch(base + '/p/api/images/vd1', { redirect: 'manual' });
  assert.equal(v.status, 302);
  assert.equal((await fetch(base + '/p/api/images/none')).status, 404);
}));

test('the original address gives a clean photo only to our own screens', () => withServer(async base => {
  const size = async (h) => (await (await fetch(base + '/img/margherita.jpg', { headers: h })).arrayBuffer()).byteLength;
  const orig = fs.statSync(path.join(__dirname, '..', 'img', 'margherita.jpg')).size;
  assert.notEqual(await size({}), orig);                                         // copied address, download tool
  assert.notEqual(await size({ Referer: base + '/', 'Sec-Fetch-Dest': 'image' }), orig); // customer site <img>
  assert.equal(await size({ 'X-Cheesy-Clean': '1' }), orig);                    // customer site's on-screen picture
  assert.equal(await size({ Referer: base + '/staff/main' }), orig);            // till
  assert.equal(await size({ Referer: base + '/display' }), orig);               // shop TV
  assert.equal(await size({ Cookie: 'a=b; cp_pos=1' }), orig);                  // Outlet POS in a browser
  const r = await fetch(base + '/img/margherita.jpg', { headers: { 'X-Cheesy-Clean': '1' } });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const tab = await fetch(base + '/img/margherita.jpg', { headers: { 'Sec-Fetch-Dest': 'document', 'X-Cheesy-Clean': '1' }, redirect: 'manual' });
  assert.equal(tab.status, 302);
  assert.match(tab.headers.get('location'), /\/p\/img\/margherita\.jpg$/);
  const up = await fetch(base + '/api/images/ph1', { headers: { 'Sec-Fetch-Dest': 'document' }, redirect: 'manual' });
  assert.equal(up.status, 302);
  const upPlain = Buffer.from(await (await fetch(base + '/api/images/ph1')).arrayBuffer());
  const upClean = Buffer.from(await (await fetch(base + '/api/images/ph1', { headers: { Referer: base + '/admin' } })).arrayBuffer());
  assert.notDeepEqual(upPlain, upClean);
  assert.equal((await fetch(base + '/img/logo.png', { headers: { 'Sec-Fetch-Dest': 'document' }, redirect: 'manual' })).status, 200);
  assert.equal((await fetch(base + '/img/intro-bg.jpg')).headers.get('cache-control'), 'public, max-age=0');
}));
