const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../server/server');

// Video uploads for the famous visitors slides. Runs without MongoDB: a stand-in store keeps files in memory.
function fakeStore() {
  const files = new Map(); let n = 0;
  return { files, async saveImage(type, data) { const id = 'f' + (++n); files.set(id, { type, data }); return id; }, async getImage(id) { return files.get(id) || null; } };
}
async function withServer(fn) {
  const store = fakeStore(), server = createApp(store).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn({ base, store }); } finally { server.close(); }
}
const clip = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

test('a video uploads and plays back whole or in parts', () => withServer(async ({ base, store }) => {
  const up = await fetch(base + '/api/videos', { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: clip });
  assert.equal(up.status, 200);
  const { url } = await up.json();
  assert.match(url, /^api\/images\/f\d+$/);
  assert.equal([...store.files.values()][0].type, 'video/mp4');

  const all = await fetch(base + '/' + url);
  assert.equal(all.status, 200);
  assert.equal(all.headers.get('content-type'), 'video/mp4');
  assert.equal(all.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await all.arrayBuffer()), clip);

  const part = await fetch(base + '/' + url, { headers: { Range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 100-199/1000');
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), clip.subarray(100, 200));

  const open = await fetch(base + '/' + url, { headers: { Range: 'bytes=990-' } });
  assert.equal(open.status, 206);
  assert.equal(open.headers.get('content-range'), 'bytes 990-999/1000');

  const tail = await fetch(base + '/' + url, { headers: { Range: 'bytes=-10' } });
  assert.equal(tail.headers.get('content-range'), 'bytes 990-999/1000');

  const past = await fetch(base + '/' + url, { headers: { Range: 'bytes=5000-' } });
  assert.equal(past.status, 416);
}));

test('only MP4, WebM or MOV videos are taken, and not empty or too big ones', () => withServer(async ({ base, store }) => {
  const send = (type, body) => fetch(base + '/api/videos', { method: 'POST', headers: { 'Content-Type': type }, body });
  assert.equal((await send('text/plain', 'hello')).status, 400);
  assert.equal((await send('image/png', clip)).status, 400);
  assert.equal((await send('video/mp4', Buffer.alloc(0))).status, 400);
  assert.equal((await send('video/quicktime', clip)).status, 200);
  assert.equal((await send('video/webm', clip)).status, 200);
  assert.equal((await send('video/mp4', Buffer.alloc(15 * 1024 * 1024 + 1))).status, 413);
  assert.equal(store.files.size, 2);
}));
