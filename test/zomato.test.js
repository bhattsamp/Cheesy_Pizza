// Zomato partner API: webhook orders in, accept / reject / ready / stock out. No MongoDB needed:
// a small in-memory store stands in for server/db.js, and a local server stands in for Zomato.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const zomato = require('../server/zomato');

function fakeStore() {
  const data = {
    outlets: [{ id: 'o1', code: 'A', name: 'Main', zomatoResId: '190001' }, { id: 'o2', code: 'B', name: 'Second', zomatoResId: '190002' }],
    menu: [{ id: 'p1', cat: 'pizza', name: 'Margherita', prices: { 7: 150, 10: 280 } }, { id: 'b1', cat: 'bread', name: 'Cheesy Garlic Bread', price: 160 }],
    sizes: [{ id: '7', label: '7"' }, { id: '10', label: '10"' }],
    orders: [], users: [{ id: 'u1', role: 'owner', name: 'Owner' }], cats: [],
  };
  const settings = {}, seq = {};
  const match = (d, f) => !f._id || (f._id.$in ? f._id.$in.includes(String(d.id)) : String(d.id) === f._id);
  return {
    data,
    getSetting: async (k, d) => (k in settings ? JSON.parse(JSON.stringify(settings[k])) : d),
    setSetting: async (k, v) => { settings[k] = v; },
    readCollection: async (n, f = {}) => JSON.parse(JSON.stringify(data[n].filter(d => match(d, f)))),
    readState: async () => ({ state: { ...JSON.parse(JSON.stringify(data)), config: { categories: [{ id: 'pizza', label: 'Pizza' }] } } }),
    checkStaffPin: async (id, pin) => id === 'u1' && pin === '1234',
    applyChanges: async ({ upsert }) => {
      const renumbered = {}, revs = {};
      for (const [n, list] of Object.entries(upsert)) for (const o of list) {
        const i = data[n].findIndex(d => d.id === o.id);
        if (i >= 0) data[n][i] = o;
        else {
          if (n === 'orders') { const out = data.outlets.find(x => x.id === o.outletId); seq[o.outletId] = (seq[o.outletId] || 0) + 1; o.no = out.code + '-' + seq[o.outletId]; renumbered[o.id] = o.no; }
          data[n].push(o);
        }
        (revs[n] = revs[n] || {})[o.id] = 1;
      }
      return { renumbered, revs };
    },
  };
}
const M = { Staff: { findById: id => ({ lean: async () => (id === 'u1' ? { id: 'u1', role: 'owner', name: 'Owner' } : null) }) } };

async function withApp(fn) {
  const store = fakeStore();
  const app = express();
  app.use(express.json());
  zomato.routes(app, store, M);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, ...(await r.json()) }));
  try { await fn({ store, post, base }); } finally { server.close(); }
}
// Stands in for Zomato's API, keeping every call it gets
async function fakeZomato(fn, status = 200) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { calls.push({ path: req.url, key: req.headers['x-zomato-api-key'], body: JSON.parse(b || '{}') }); res.writeHead(status); res.end(status === 200 ? '{"status":"success"}' : 'bad'); });
  }).listen(0);
  process.env.ZOMATO_API_BASE = `http://127.0.0.1:${srv.address().port}/v1`;
  process.env.ZOMATO_API_KEY = 'zk_test';
  try { await fn(calls); } finally { srv.close(); delete process.env.ZOMATO_API_BASE; delete process.env.ZOMATO_API_KEY; }
}
const ORDER = {
  event: 'order_placed', order: {
    order_id: 5123456789, res_id: 190002, total_amount: 560, customer: { name: 'Riya' }, special_instructions: 'Extra spicy',
    items: [{ name: 'Margherita', variant_name: '10"', quantity: 2, unit_cost: 250 }, { name: 'Choco Lava Cake', quantity: 1, unit_cost: 99, addons: [{ name: 'Ice cream' }] }],
  },
};
process.env.ZOMATO_WEBHOOK_SECRET = 'whsec';
const H = { 'X-Webhook-Secret': 'whsec' };

test('reads a Zomato order and matches its lines to our menu', () => {
  const z = zomato.readOrder(ORDER);
  assert.equal(z.kind, 'new');
  assert.equal(z.zid, '5123456789');
  assert.equal(z.resId, '190002');
  assert.equal(z.total, 560);
  const store = fakeStore();
  const lines = zomato.toLines(z.items, store.data.menu, store.data.sizes);
  assert.deepEqual(lines[0], { itemId: 'p1', cat: 'pizza', name: 'Margherita', size: '10', addons: [], qty: 2, unit: 250, custom: false });
  assert.equal(lines[1].itemId, 'zomato');
  assert.equal(lines[1].zomatoOnly, true);
  assert.deepEqual(lines[1].notes, ['Ice cream']);
  // our own ids, once the menu was sent from here
  assert.equal(zomato.toLines([{ name: 'Whatever', posId: 'p1:7', qty: 1, unit: 150, variant: '', addons: [] }], store.data.menu, store.data.sizes)[0].size, '7');
  assert.equal(zomato.readOrder({ event: 'order_cancelled', order_id: '77' }).kind, 'cancelled');
  assert.equal(zomato.readOrder({ event: 'rider_arrived', order_id: '77', rider: { name: 'Ajay' } }).rider.name, 'Ajay');
  assert.equal(zomato.readOrder({ foo: 1 }), null);
});

test('webhook: needs the secret, saves the order once, at the outlet with that Zomato ID', () => withApp(async ({ store, post }) => {
  assert.equal((await post('/api/zomato/webhook', ORDER)).status, 401);
  assert.equal((await post('/api/zomato/webhook', ORDER, { 'X-Webhook-Secret': 'nope' })).status, 401);
  const r = await post('/api/zomato/webhook', ORDER, H);
  assert.equal(r.ok, true);
  assert.equal(r.no, 'B-1');
  const o = store.data.orders[0];
  assert.equal(o.outletId, 'o2');
  assert.equal(o.type, 'zomato');
  assert.equal(o.source, 'zomato');
  assert.equal(o.status, 'placed');
  assert.equal(o.zomatoId, '5123456789');
  assert.equal(o.subtotal, 599);
  assert.equal(o.total, 560);
  assert.deepEqual(o.discounts, [{ name: 'Zomato discount', amt: 39 }]);
  assert.equal(o.paid, true);
  assert.equal(o.pay.mode, 'zomato');
  assert.equal(o.note, 'Extra spicy');
  assert.equal((await post('/api/zomato/webhook', ORDER, H)).duplicate, true);
  assert.equal(store.data.orders.length, 1);
  assert.equal((await post('/api/zomato/webhook', { order: { ...ORDER.order, res_id: 999 } }, H)).status, 404);
  // rider update, then Zomato cancels
  await post('/api/zomato/webhook', { event: 'rider_assigned', order_id: '5123456789', res_id: '190002', rider: { name: 'Ajay', phone: '98xxxxxx01' } }, H);
  assert.equal(store.data.orders[0].zrider.name, 'Ajay');
  await post('/api/zomato/webhook', { event: 'order_cancelled', order_id: '5123456789', res_id: '190002' }, H);
  assert.equal(store.data.orders[0].status, 'cancelled');
  assert.equal(store.data.orders[0].cancel.by, 'Zomato');
}));

test('accept, ready, reject and stock go to Zomato; nothing for other orders', () => withApp(async ({ store, post }) => fakeZomato(async calls => {
  await post('/api/zomato/webhook', ORDER, H);
  const o = store.data.orders[0];
  const save = async (next, menu = []) => {
    const before = await zomato.beforeSave(store, [next], menu);
    await store.applyChanges({ upsert: { orders: [next], ...(menu.length ? { menu } : {}) } });
    await zomato.afterSave(store, before, [next], menu);
  };
  await save({ ...o, status: 'preparing', wait: 20 });
  await save({ ...store.data.orders[0], status: 'ready' });
  await save({ ...store.data.orders[0], status: 'done' });
  assert.deepEqual(calls.map(c => [c.path, c.body]), [
    ['/v1/order/accept', { order_id: '5123456789', res_id: '190002', prep_time: 20 }],
    ['/v1/order/ready', { order_id: '5123456789', res_id: '190002' }],
  ]);
  assert.equal(calls[0].key, 'zk_test');
  // a second order is rejected at the till
  await post('/api/zomato/webhook', { order: { ...ORDER.order, order_id: 42 } }, H);
  const o2 = store.data.orders[1];
  await save({ ...o2, status: 'cancelled', cancel: { by: 'Asha', code: 'stock', why: 'Items out of stock' } });
  assert.deepEqual(calls[2].body, { order_id: '42', res_id: '190002', reason_code: 'stock', reason: 'Items out of stock' });
  // a manual Zomato order typed at the till is not sent anywhere
  store.data.orders.push({ id: 'm1', type: 'zomato', source: 'pos', zomatoId: '1', status: 'preparing' });
  await save({ id: 'm1', type: 'zomato', source: 'pos', zomatoId: '1', status: 'ready' });
  assert.equal(calls.length, 3);
  // switching an item off tells Zomato for every outlet that has a Zomato ID
  await save({ ...store.data.orders[0] }, [{ ...store.data.menu[0], off: true }]);
  assert.deepEqual(calls.slice(3).map(c => c.body), [{ res_id: '190001', item_id: 'p1', in_stock: false }, { res_id: '190002', item_id: 'p1', in_stock: false }]);
  const log = await store.getSetting('zomatoLog', []);
  assert.equal(log.length, 5);
  assert.ok(log.every(e => e.ok));
})));

test('not linked yet: calls are only logged; a Zomato error is logged as failed', () => withApp(async ({ store, post }) => {
  await post('/api/zomato/webhook', ORDER, H);
  const o = store.data.orders[0];
  const before = await zomato.beforeSave(store, [o], []);
  const next = { ...o, status: 'preparing' };
  await store.applyChanges({ upsert: { orders: [next] } });
  await zomato.afterSave(store, before, [next], []);
  let log = await store.getSetting('zomatoLog', []);
  assert.equal(log[0].offline, true);
  await fakeZomato(async () => {
    const b2 = await zomato.beforeSave(store, [next], []);
    const n2 = { ...next, status: 'ready' };
    await store.applyChanges({ upsert: { orders: [n2] } });
    await zomato.afterSave(store, b2, [n2], []);
  }, 500);
  log = await store.getSetting('zomatoLog', []);
  assert.equal(log[0].ok, false);
  assert.equal(log[0].what, 'ready');
}));

test('owner sends the menu with our ids and sizes', () => withApp(async ({ post }) => fakeZomato(async calls => {
  assert.equal((await post('/api/zomato/menu', { staffId: 'u1', pin: '0000', outletId: 'o1' })).status, 403);
  const r = await post('/api/zomato/menu', { staffId: 'u1', pin: '1234', outletId: 'o1' });
  assert.equal(r.ok, true);
  assert.equal(r.items, 2);
  const body = calls[0].body;
  assert.equal(body.res_id, '190001');
  assert.deepEqual(body.items[0].variants, [{ vendor_entity_id: 'p1:7', name: '7"', price: 150 }, { vendor_entity_id: 'p1:10', name: '10"', price: 280 }]);
  assert.equal(body.items[1].price, 160);
})));
