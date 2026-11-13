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

test('orders round-trip and get running numbers per outlet', () => withServer(async ({ get, post }) => {
  const order = {
    id: 'ord1', no: 'A-1', outletId: 'o1', date: '2026-10-08', ts: 1, status: 'preparing', source: 'pos', type: 'dine',
    table: '3', address: '', customer: { name: 'Asha', phone: '9000000000' }, pay: { mode: 'cash', given: 500, change: 20 },
    paid: true, times: { placed: 1 }, subtotal: 480, total: 480, discounts: [{ name: 'X', amt: 0 }],
    items: [{ itemId: 'p1', cat: 'pizza', name: 'Margherita', size: '7', addons: ['burst'], qty: 2, unit: 220, custom: false, notes: ['Soft bake'] },
      { itemId: 'b1', cat: 'bread', name: 'Cheesy Garlic Bread', size: null, addons: [], qty: 1, unit: 160, custom: false }],
  };
  const r1 = await post('/api/sync', { upsert: { orders: [order, { ...order, id: 'ord2' }] } });
  assert.deepEqual(r1.renumbered, { ord2: 'A-2' });
  assert.equal(r1.seq.o1, 2);
  // The count carries on the next day instead of starting again at 1
  const r2 = await post('/api/sync', { upsert: { orders: [{ ...order, id: 'ord3', no: 'A-1', date: '2026-10-09' }] } });
  assert.deepEqual(r2.renumbered, { ord3: 'A-3' });
  await post('/api/sync', { delete: { orders: ['ord3'] } });
  const [saved] = await get('/api/orders?date=2026-10-08&outlet=o1&status=preparing');
  assert.deepEqual(saved, order);
  await post('/api/sync', { upsert: { orders: [{ ...order, status: 'done' }] }, delete: { orders: ['ord2'] } });
  const all = await get('/api/orders');
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'done');
  assert.equal(all[0].no, 'A-1');
}));

test('old A-ddmmyy-001 numbers move to running numbers once, by time placed', () => withServer(async ({ get, store }) => {
  const M = require('../server/models');
  const base = { status: 'done', source: 'pos', type: 'takeaway', customer: { name: '', phone: '' }, items: [], total: 0 };
  const old = [
    { id: 'x1', no: 'A-081126-002', outletId: 'o1', date: '2026-11-08', ts: 200 },
    { id: 'x2', no: 'A-081126-001', outletId: 'o1', date: '2026-11-08', ts: 100 },
    { id: 'x3', no: 'A-091126-001', outletId: 'o1', date: '2026-11-09', ts: 300 },
    { id: 'x4', no: 'B-091126-001', outletId: 'o2', date: '2026-11-09', ts: 250 },
  ];
  await M.Order.insertMany(old.map((o, i) => ({ ...base, ...o, _id: o.id, _pos: i, _rev: 1 })));
  await M.UpiAlert.create({ _id: 'u1', id: 'u1', orderId: 'x3', orderNo: 'A-091126-001' });
  await M.Counter.create({ _id: 'no:o1|2026-11-09', n: 1 });
  await store.setSetting('runningNos', false);
  const r = await store.migrateRunningNos();
  assert.deepEqual(r.last, { o1: 3, o2: 1 });
  const nos = Object.fromEntries((await get('/api/orders')).map(o => [o.id, [o.no, o.oldNo]]));
  assert.deepEqual(nos, { x1: ['A-2', 'A-081126-002'], x2: ['A-1', 'A-081126-001'], x3: ['A-3', 'A-091126-001'], x4: ['B-1', 'B-091126-001'] });
  assert.equal((await M.UpiAlert.findById('u1').lean()).orderNo, 'A-3');
  assert.ok(await M.Backup.exists({ _id: /^before-order-numbers-/ }), 'backup saved first');
  const { state } = await get('/api/state');
  assert.deepEqual(state.seq, { o1: 3, o2: 1 });
  assert.equal(await store.migrateRunningNos(), null, 'runs only once');
  assert.equal((await store.nextOrderNo('o1')), 'A-4');
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

test('categories the owner adds are saved and read back after the built-in ones', () => withServer(async ({ get, post }) => {
  assert.deepEqual((await get('/api/state')).state.cats, []);
  await post('/api/sync', { upsert: { cats: [{ id: 'c_burgers', label: 'Burgers', labelGu: '', pos: 1 }, { id: 'pizza', off: true }] } });
  const { state } = await get('/api/state');
  assert.deepEqual(state.cats.map(c => c.id), ['c_burgers', 'pizza']);
  assert.equal(state.cats[1].off, true);
  assert.deepEqual(state.config.categories.map(c => c.id), ['pizza', 'pockets', 'bread', 'fries', 'dessert', 'dip']);
}));
