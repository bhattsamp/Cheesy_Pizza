const test = require('node:test');
const assert = require('node:assert');
const { Store } = require('../server/db');
const { createApp } = require('../server/server');
const { seedData } = require('../server/seed-data');

// Needs a MongoDB to test against: MONGODB_TEST_URI, or a local one on the default port.
// The test database is wiped.
const URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/cheesy_pizza_test';
let store;
test.before(async () => { store = await new Store().connect(URI); });
test.after(() => store.close());

async function withServer(fn) {
  await store.seed(seedData());
  const server = createApp(store).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = p => fetch(base + p).then(r => r.json());
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, ...(await r.json()) }));
  try { await fn({ get, post, store, base }); } finally { server.close(); }
}

test('seeded state matches the old hardcoded data', () => withServer(async ({ get }) => {
  const { state, demoPending } = await get('/api/state');
  assert.equal(demoPending, true);
  assert.equal(state.menu.length, 27);
  assert.deepEqual(state.menu.find(m => m.id === 'p1').prices, { '7': 150, '10': 280 });
  assert.equal(state.offers.length, 9);
  assert.equal(state.outlets[0].riders.length, 2);
  assert.deepEqual(state.config.categories.map(c => c.id), ['pizza', 'pockets', 'bread', 'fries', 'dessert', 'dip']);
  assert.equal(state.config.prepMin, 15);
  assert.ok(state.config.payModes.some(p => p.id === 'bank'));
  assert.equal(state.addons.veg.choices.length, 9);
  assert.deepEqual(state.extras.map(g => g.name), ['Extra veg topping', 'Toppings']);
  assert.equal(state.extras[0].items.length, 9);
  assert.deepEqual(state.extras[1].items[0], { name: 'Extra Cheese', prices: { 7: 40, 10: 60 } });
  // PIN hashes are never sent to the browser
  assert.deepEqual(state.users.map(u => u.pin), [true, true, true]);
  assert.ok(!JSON.stringify(state).includes('scrypt'));
}));

test('PINs are checked on the server', () => withServer(async ({ post }) => {
  assert.equal((await post('/api/auth/staff', { id: 'u1', pin: '1234' })).ok, true);
  assert.equal((await post('/api/auth/staff', { id: 'u1', pin: '0000' })).ok, false);
  assert.equal((await post('/api/auth/customer', { phone: '9825011111', pin: '1234' })).ok, true);
  await post('/api/sync', { upsert: { users: [{ id: 'u2', name: 'Cashier', role: 'cashier', pin: true, _newPin: '4321' }] } });
  assert.equal((await post('/api/auth/staff', { id: 'u2', pin: '4321' })).ok, true);
  await post('/api/sync', { upsert: { users: [{ id: 'u2', name: 'Cashier 2', role: 'cashier', pin: true }] } });
  assert.equal((await post('/api/auth/staff', { id: 'u2', pin: '4321' })).ok, true, 'pin kept when not changed');
}));

test('orders round-trip and get numbered per outlet per day', () => withServer(async ({ get, post }) => {
  const order = {
    id: 'ord1', no: 'A-001', outletId: 'o1', date: '2026-10-08', ts: 1, status: 'preparing', source: 'pos', type: 'dine',
    table: '3', address: '', customer: { name: 'Asha', phone: '9000000000' }, pay: { mode: 'cash', given: 500, change: 20 },
    paid: true, times: { placed: 1 }, subtotal: 480, total: 480, discounts: [{ name: 'X', amt: 0 }],
    items: [{ itemId: 'p1', cat: 'pizza', name: 'Margherita', size: '7', addons: ['burst'], qty: 2, unit: 220, custom: false, notes: ['Soft bake'] },
      { itemId: 'b1', cat: 'bread', name: 'Cheesy Garlic Bread', size: null, addons: [], qty: 1, unit: 160, custom: false }],
  };
  const r1 = await post('/api/sync', { upsert: { orders: [order, { ...order, id: 'ord2' }] } });
  assert.deepEqual(r1.renumbered, { ord2: 'A-002' });
  assert.equal(r1.seq['o1|2026-10-08'], 2);
  const [saved] = await get('/api/orders?date=2026-10-08&outlet=o1&status=preparing');
  assert.deepEqual(saved, order);
  await post('/api/sync', { upsert: { orders: [{ ...order, status: 'done' }] }, delete: { orders: ['ord2'] } });
  const all = await get('/api/orders');
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'done');
  assert.equal(all[0].no, 'A-001');
}));

test('edited values keep their type', () => withServer(async ({ get, post }) => {
  const { state } = await get('/api/state');
  const o = { ...state.outlets[0], tables: '12', riders: [] };
  await post('/api/sync', { upsert: { outlets: [o] }, delete: { menu: ['x1'] } });
  const outs = await get('/api/outlets');
  assert.deepEqual(outs[0], o);
  assert.equal(typeof outs[0].tables, 'string');
  assert.equal((await get('/api/menu')).length, 26);
}));

test('demo orders are handed out once', () => withServer(async ({ post }) => {
  assert.equal((await post('/api/demo/claim', {})).ok, true);
  assert.equal((await post('/api/demo/claim', {})).ok, false);
}));

test('menu photos are stored and served', () => withServer(async ({ post, base }) => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { url } = await post('/api/images', { data: 'data:image/png;base64,' + png });
  assert.match(url, /^api\/images\/[0-9a-f]+$/);
  const r = await fetch(base + '/' + url);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), Buffer.from(png, 'base64'));
  assert.equal((await post('/api/images', { data: 'data:text/html;base64,AAAA' })).status, 400);
}));

test('unknown collections are rejected', () => withServer(async ({ post }) => {
  assert.equal((await post('/api/sync', { upsert: { secrets: [] } })).status, 400);
}));
