// Cheesy Pizza server: serves the site and a JSON API over MongoDB.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const { Store, COLLECTIONS } = require('./db');
const { seedData } = require('./seed-data');
const push = require('./push');
const otp = require('./otp');

const ROOT = path.join(__dirname, '..');
const DEFAULT_URI = 'mongodb://localhost:27017/ChessyPizza';
const MAX_IMAGE = 3 * 1024 * 1024; // photos are shrunk in the browser first

async function openStore(uri = process.env.MONGODB_URI || DEFAULT_URI) {
  const store = await new Store().connect(uri);
  store.uri = uri.replace(/\/\/[^@/]*@/, '//***@'); // hide credentials in logs
  if (!(await store.isSeeded())) await store.seed(seedData());
  else await store.addExtraMenus(seedData().state.extras);
  return store;
}

function createApp(store) {
  const app = express();
  app.set('trust proxy', true); // Render's proxy passes the caller's IP, used to limit email codes
  app.use(express.json({ limit: '5mb' }));

  /* ----- whole app state ----- */
  app.get('/api/state', async (req, res) => res.json(await store.readState()));
  app.get('/api/version', async (req, res) => res.json({ version: await store.version() }));

  // Save changes: { upsert: { orders: [...], customers: {phone: {...}} }, delete: { menu: ['p1'] } }
  app.post('/api/sync', async (req, res) => {
    const body = req.body || {};
    for (const part of ['upsert', 'delete']) {
      const bad = Object.keys(body[part] || {}).filter(k => !COLLECTIONS.includes(k));
      if (bad.length) return res.status(400).json({ error: 'Unknown collection: ' + bad.join(', ') });
    }
    // What this save changes, to alert phones: new online orders for the outlet's Admin apps,
    // order progress for the customer who placed it, and offers that just went live
    const up = body.upsert || {};
    const orders = [].concat(up.orders || []).filter(o => o && o.id);
    const offers = [].concat(up.offers || []).filter(o => o && o.id);
    let before = null;
    if (push.pushEnabled() && (orders.length || offers.length)) {
      before = { orders: new Map(), offers: new Map() };
      if (orders.length) (await store.readCollection('orders', { _id: { $in: orders.map(o => String(o.id)) } })).forEach(o => before.orders.set(o.id, o.status));
      if (offers.length) (await store.readCollection('offers', { _id: { $in: offers.map(o => String(o.id)) } })).forEach(o => before.offers.set(o.id, !!o.active));
    }
    let r;
    try {
      r = await store.applyChanges(body);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    res.json(r);
    if (before) {
      const withNo = o => ({ ...o, no: r.renumbered[o.id] || o.no });
      const fresh = orders.filter(o => !before.orders.has(o.id) && o.source === 'online' && o.status === 'placed').map(withNo);
      const moved = orders.filter(o => before.orders.has(o.id) && before.orders.get(o.id) !== o.status).map(withNo);
      const live = offers.filter(o => o.active && !before.offers.get(o.id));
      const fail = e => console.error('Push alert failed:', e.message);
      push.notifyNewOrders(fresh).catch(fail);
      push.notifyOrderUpdates(moved).catch(fail);
      push.notifyNewOffers(live).catch(fail);
    }
  });

  /* ----- push alerts for the Admin app ----- */
  app.get('/api/push/status', (req, res) => res.json({ enabled: push.pushEnabled() }));
  // A phone signs up when staff log in, so the PIN is checked here
  app.post('/api/push/register', async (req, res) => {
    const { token, staffId, pin, outletId } = req.body || {};
    if (!token || !outletId || !(await store.checkStaffPin(staffId, pin))) return res.status(403).json({ error: 'Not allowed' });
    await push.saveToken(String(token), outletId, staffId);
    res.json({ ok: true });
  });
  app.post('/api/push/refresh', async (req, res) => {
    const { old, token, outletId } = req.body || {};
    if (!old || !token) return res.status(400).json({ error: 'Missing token' });
    res.json({ ok: await push.refreshToken(String(old), String(token), outletId) });
  });
  // Customer app phones: offers for everyone, updates for the orders this phone placed
  app.post('/api/push/customer', async (req, res) => {
    const { token, old, orders } = req.body || {};
    if (!token || typeof token !== 'string' || token.length > 4096) return res.status(400).json({ error: 'Missing token' });
    await push.saveCustomerToken(token, old, [].concat(orders || []).filter(x => typeof x === 'string').slice(0, 10));
    res.json({ ok: true });
  });
  app.post('/api/push/unregister', async (req, res) => {
    if ((req.body || {}).token) await push.removeToken(req.body.token);
    res.json({ ok: true });
  });

  /* ----- email codes for customer sign-up ----- */
  app.get('/api/otp/status', (req, res) => res.json({ enabled: otp.otpEnabled() }));
  app.post('/api/otp/send', async (req, res) => {
    const r = await otp.sendCode((req.body || {}).email, req.ip);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    res.json({ ok: true });
  });
  app.post('/api/otp/verify', (req, res) => {
    const { email, code } = req.body || {};
    res.json({ ok: otp.checkCode(email, code) });
  });

  /* ----- PIN checks (PIN hashes never leave the server) ----- */
  app.post('/api/auth/customer', async (req, res) => {
    const { phone, pin } = req.body || {};
    res.json({ ok: await store.checkCustomerPin(phone, pin) });
  });
  app.post('/api/auth/staff', async (req, res) => {
    const { id, pin } = req.body || {};
    res.json({ ok: await store.checkStaffPin(id, pin) });
  });

  /* ----- menu photos: { data: 'data:image/jpeg;base64,...' } -> { url } ----- */
  app.post('/api/images', async (req, res) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).data || ''));
    if (!m) return res.status(400).json({ error: 'Send a JPEG, PNG or WebP image' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGE) return res.status(413).json({ error: 'Image is too big' });
    res.json({ url: 'api/images/' + await store.saveImage(m[1], buf) });
  });
  app.get('/api/images/:id', async (req, res) => {
    const img = await store.getImage(req.params.id);
    if (!img) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(img.type).send(Buffer.isBuffer(img.data) ? img.data : Buffer.from(img.data.buffer)); // a BSON Binary from MongoDB
  });

  /* ----- demo data ----- */
  app.post('/api/demo/claim', async (req, res) => res.json({ ok: await store.claimDemo() }));
  app.post('/api/reset', async (req, res) => {
    await store.seed(seedData());
    res.json(await store.readState());
  });

  /* ----- read-only lookups ----- */
  app.get('/api/config', async (req, res) => res.json(await store.readConfig()));
  for (const name of ['menu', 'outlets', 'offers', 'combos', 'sizes', 'addons']) {
    app.get('/api/' + name, async (req, res) => res.json(await store.readCollection(name)));
  }
  app.get('/api/orders', async (req, res) => {
    const filter = {};
    for (const [q, field] of [['outlet', 'outletId'], ['date', 'date'], ['status', 'status'], ['phone', 'customer.phone']]) {
      if (req.query[q]) filter[field] = String(req.query[q]);
    }
    res.json(await store.readCollection('orders', filter));
  });
  app.get('/api/customers/:phone', async (req, res) => {
    const c = (await store.readCollection('customers', { _id: String(req.params.phone) }))[req.params.phone];
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  });

  /* ----- site ----- */
  app.use('/img', express.static(path.join(ROOT, 'img')));
  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });
  return app;
}

if (require.main === module) {
  try {
    if (push.initPush()) console.log('Push alerts for the Admin app are on');
  } catch (e) { console.error('Push alerts are off: FIREBASE_SERVICE_ACCOUNT is not a valid key:', e.message); }
  openStore().then(store => {
    const port = +process.env.PORT || 3000;
    createApp(store).listen(port, () => console.log(`Cheesy Pizza running at http://localhost:${port}  (database: ${store.uri})`));
  }).catch(e => { console.error('Could not connect to MongoDB:', e.message); process.exit(1); });
}

module.exports = { createApp, openStore };
