// Cheesy Pizza server: serves the site and a JSON API over the SQLite database.
const path = require('path');
const express = require('express');
const { Store, COLLECTIONS } = require('./db');
const { seedData } = require('./seed-data');

const ROOT = path.join(__dirname, '..');

function openStore(file = process.env.DB_PATH || path.join(ROOT, 'data', 'cheesy.db')) {
  const store = new Store(file);
  store.file = file;
  if (!store.isSeeded()) store.seed(seedData());
  return store;
}

function createApp(store) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  /* ----- whole app state ----- */
  app.get('/api/state', (req, res) => res.json(store.readState()));
  app.get('/api/version', (req, res) => res.json({ version: store.version() }));

  // Save changes: { upsert: { orders: [...], customers: {phone: {...}} }, delete: { menu: ['p1'] } }
  app.post('/api/sync', (req, res) => {
    const body = req.body || {};
    for (const part of ['upsert', 'delete']) {
      const bad = Object.keys(body[part] || {}).filter(k => !COLLECTIONS.includes(k));
      if (bad.length) return res.status(400).json({ error: 'Unknown collection: ' + bad.join(', ') });
    }
    try {
      res.json(store.applyChanges(body));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* ----- PIN checks (PIN hashes never leave the server) ----- */
  app.post('/api/auth/customer', (req, res) => {
    const { phone, pin } = req.body || {};
    res.json({ ok: store.checkCustomerPin(phone, pin) });
  });
  app.post('/api/auth/staff', (req, res) => {
    const { id, pin } = req.body || {};
    res.json({ ok: store.checkStaffPin(id, pin) });
  });

  /* ----- demo data ----- */
  app.post('/api/demo/claim', (req, res) => res.json({ ok: store.claimDemo() }));
  app.post('/api/reset', (req, res) => {
    store.seed(seedData());
    res.json(store.readState());
  });

  /* ----- read-only lookups ----- */
  app.get('/api/config', (req, res) => res.json(store.readConfig()));
  for (const name of ['menu', 'outlets', 'offers', 'combos', 'sizes', 'addons']) {
    app.get('/api/' + name, (req, res) => res.json(store.readCollection(name)));
  }
  app.get('/api/orders', (req, res) => {
    const where = [], params = [];
    for (const [q, col] of [['outlet', 'outlet_id'], ['date', 'date'], ['status', 'status'], ['phone', 'customer_phone']]) {
      if (req.query[q]) { where.push(`${col} = ?`); params.push(String(req.query[q])); }
    }
    res.json(store.readCollection('orders', where.length ? 'WHERE ' + where.join(' AND ') : '', params));
  });
  app.get('/api/customers/:phone', (req, res) => {
    const c = store.readCollection('customers', 'WHERE phone = ?', [req.params.phone])[req.params.phone];
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  });

  /* ----- site ----- */
  app.use('/img', express.static(path.join(ROOT, 'img')));
  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

  return app;
}

if (require.main === module) {
  const store = openStore();
  const port = +process.env.PORT || 3000;
  createApp(store).listen(port, () => console.log(`Cheesy Pizza running at http://localhost:${port}  (database: ${store.file})`));
}

module.exports = { createApp, openStore };
