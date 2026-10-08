// Cheesy Pizza server: serves the site and a JSON API over MongoDB.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const { Store, COLLECTIONS } = require('./db');
const { seedData } = require('./seed-data');

const ROOT = path.join(__dirname, '..');
const DEFAULT_URI = 'mongodb://localhost:27017/ChessyPizza';

async function openStore(uri = process.env.MONGODB_URI || DEFAULT_URI) {
  const store = await new Store().connect(uri);
  store.uri = uri.replace(/\/\/[^@/]*@/, '//***@'); // hide credentials in logs
  if (!(await store.isSeeded())) await store.seed(seedData());
  return store;
}

function createApp(store) {
  const app = express();
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
    try {
      res.json(await store.applyChanges(body));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
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
  openStore().then(store => {
    const port = +process.env.PORT || 3000;
    createApp(store).listen(port, () => console.log(`Cheesy Pizza running at http://localhost:${port}  (database: ${store.uri})`));
  }).catch(e => { console.error('Could not connect to MongoDB:', e.message); process.exit(1); });
}

module.exports = { createApp, openStore };
