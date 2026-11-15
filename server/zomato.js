// Zomato orders, run from our own POS through Zomato's partner (POS integration) API.
//
// In:  Zomato posts each new order, cancellation and rider update to /api/zomato/webhook. A new order
//      becomes a normal POS order (type 'zomato', status 'placed'), so it rings on the tills and the
//      Admin app like an online order, and the cashier taps Accept (with a prep time) or Reject.
// Out: when a till saves a Zomato order as accepted, rejected or food ready, and when a menu item is
//      switched off or on, the server tells Zomato. Each call and its answer is kept in a short log
//      that Outlets › Zomato shows.
//
// Zomato hands its exact API paths and field names to approved partners, so everything that depends
// on them sits in PATHS, readOrder() and the body builders below. Until ZOMATO_API_BASE and
// ZOMATO_API_KEY are set, orders still come in through the webhook and the outgoing calls are only
// logged ("not connected"), so staff accept them in the Zomato app as today.
const crypto = require('crypto');

const env = () => ({
  base: (process.env.ZOMATO_API_BASE || '').replace(/\/+$/, ''),
  key: process.env.ZOMATO_API_KEY || '',
  secret: process.env.ZOMATO_WEBHOOK_SECRET || '',
});
const connected = () => !!(env().base && env().key);
const webhookOn = () => !!env().secret;

// Where each call goes, relative to ZOMATO_API_BASE. Each can be changed without a code change.
const PATHS = {
  accept: process.env.ZOMATO_PATH_ACCEPT || '/order/accept',
  reject: process.env.ZOMATO_PATH_REJECT || '/order/reject',
  ready: process.env.ZOMATO_PATH_READY || '/order/ready',
  stock: process.env.ZOMATO_PATH_STOCK || '/menu/item/stock',
  menu: process.env.ZOMATO_PATH_MENU || '/menu',
};

// The reasons the till offers when rejecting, with the codes we send
const REJECT = { stock: 'Items out of stock', busy: 'Kitchen is too busy', closed: 'Outlet closed', other: 'Other reason' };

const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const first = (o, keys) => { for (const k of keys) { const v = k.split('.').reduce((x, p) => x == null ? x : x[p], o); if (v != null && v !== '') return v; } return undefined; };
// The shop's day, in India
const istDate = (ts = Date.now()) => new Date(ts + 5.5 * 3600e3).toISOString().slice(0, 10);
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* ---------- reading Zomato's webhook ---------- */
// One webhook body -> { kind: 'new' | 'cancelled' | 'rider', zid, resId, items, total, name, note, rider }
function readOrder(body) {
  const b = body || {};
  const o = b.order || (b.data && (b.data.order || b.data)) || b;
  const zid = clean(first(o, ['order_id', 'orderId', 'id', 'order_no']) ?? first(b, ['order_id', 'orderId']), 24);
  if (!zid) return null;
  const resId = clean(first(o, ['res_id', 'resId', 'outlet_id', 'outletId', 'restaurant_id', 'store_id']) ?? first(b, ['res_id', 'outlet_id', 'restaurant_id']), 24);
  const ev = norm(first(b, ['event', 'event_type', 'type', 'action']) || first(o, ['state', 'order_state', 'status', 'order_status']) || '');
  let kind = 'new';
  if (/cancel|reject|timeout|timed out/.test(ev)) kind = 'cancelled';
  else if (/rider|valet|delivery partner|pickup|picked|arriv|assign|dispatch/.test(ev)) kind = 'rider';
  const items = [].concat(first(o, ['items', 'dishes', 'order_items', 'cart.items']) || []).slice(0, 60).map(i => {
    const qty = Math.max(1, Math.min(99, parseInt(first(i, ['quantity', 'qty', 'count']), 10) || 1));
    const total = num(first(i, ['total_cost', 'total', 'total_price', 'final_price']));
    const unit = num(first(i, ['unit_cost', 'unit_price', 'price', 'cost'])) || (total ? total / qty : 0);
    const addons = [].concat(first(i, ['addons', 'modifiers', 'customisations', 'customizations', 'groups']) || [])
      .flatMap(g => g && (g.items || g.options) ? [].concat(g.items || g.options) : [g])
      .map(a => clean(typeof a === 'string' ? a : first(a || {}, ['name', 'title']), 40)).filter(Boolean);
    return {
      name: clean(first(i, ['name', 'item_name', 'dish_name', 'title']), 60), qty, unit: num(unit),
      variant: clean(first(i, ['variant_name', 'variant', 'size', 'variant.name']), 30),
      posId: clean(first(i, ['vendor_entity_id', 'vendor_id', 'external_id', 'pos_id', 'item_id']), 40), addons,
    };
  }).filter(i => i.name);
  const cust = o.customer || o.user || {};
  return {
    kind, zid, resId, items,
    total: num(first(o, ['total_amount', 'order_total', 'total', 'net_amount', 'amount', 'bill_amount'])),
    name: clean(first(cust, ['name', 'first_name']) || first(o, ['customer_name']), 30),
    note: clean(first(o, ['special_instructions', 'instructions', 'instruction', 'note', 'comments']), 200),
    rider: kind === 'rider' ? { name: clean(first(o, ['rider.name', 'rider_name', 'valet_name']) ?? first(b, ['rider.name', 'rider_name']), 40),
      phone: clean(first(o, ['rider.phone', 'rider_phone', 'valet_phone']) ?? first(b, ['rider.phone', 'rider_phone']), 15),
      status: clean(first(b, ['rider_status', 'status', 'event']) || ev, 40) } : null,
  };
}

// Zomato's lines -> our order lines, matched to our menu by our item id (once the menu is sent to
// Zomato from here) or by name, and the size by its name (7", Regular...). A line we can't match
// still goes to the kitchen under Zomato's own name.
function toLines(items, menu, sizes) {
  const byId = new Map(menu.map(m => [String(m.id), m]));
  const byName = new Map(menu.map(m => [norm(m.name), m]));
  const sizeOf = (m, variant) => {
    const keys = Object.keys((m && m.prices) || {});
    if (!keys.length) return null;
    const v = norm(variant);
    const hit = keys.find(k => v && (norm(k) === v || norm((sizes.find(s => String(s.id) === k) || {}).label) === v || v.includes(norm(k))));
    return hit || (keys.length === 1 ? keys[0] : keys[0]);
  };
  return items.map(i => {
    const [pid, psize] = i.posId.split(':');
    const m = byId.get(pid) || byName.get(norm(i.name)) || byName.get(norm(i.name.replace(/\s*\(.*\)$/, '')));
    const size = m ? (psize && m.prices && psize in m.prices ? psize : sizeOf(m, i.variant)) : null;
    const notes = [...(i.variant && !m ? [i.variant] : []), ...i.addons];
    return { itemId: m ? m.id : 'zomato', cat: m ? m.cat : '', name: m ? m.name : i.name, size, addons: [], qty: i.qty, unit: i.unit, custom: false,
      ...(notes.length ? { notes } : {}), ...(m ? {} : { zomatoOnly: true }) };
  });
}

/* ---------- calling Zomato ---------- */
async function call(store, what, body) {
  const at = Date.now();
  let entry;
  if (!connected()) entry = { at, what, ok: false, offline: true, ref: body.order_id || body.item_id || '', msg: 'Not connected to Zomato yet' };
  else {
    try {
      const r = await fetch(env().base + PATHS[what], {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'X-Zomato-Api-Key': env().key, Authorization: 'Bearer ' + env().key },
        body: JSON.stringify(body),
      });
      const txt = (await r.text()).slice(0, 300);
      entry = { at, what, ok: r.ok, ref: body.order_id || body.item_id || '', status: r.status, msg: r.ok ? 'Done' : txt || 'HTTP ' + r.status };
    } catch (e) { entry = { at, what, ok: false, ref: body.order_id || body.item_id || '', msg: e.message }; }
  }
  if (!entry.ok && !entry.offline) console.error('Zomato', what, entry.ref, entry.msg);
  const log = await store.getSetting('zomatoLog', []);
  log.unshift(entry);
  await store.setSetting('zomatoLog', log.slice(0, 60));
  return entry;
}

// What one till save changes for Zomato: accept, reject or ready for its Zomato orders,
// and item stock for menu items switched off or on. Runs after the save is answered.
async function afterSave(store, before, orders, menu) {
  const outlets = await store.readCollection('outlets');
  const resOf = id => clean((outlets.find(o => String(o.id) === String(id)) || {}).zomatoResId, 24);
  for (const o of orders) {
    if (o.type !== 'zomato' || o.source !== 'zomato' || !o.zomatoId) continue;
    const was = before.orders.get(o.id);
    if (!was || was === o.status) continue;
    const base = { order_id: o.zomatoId, res_id: resOf(o.outletId) };
    if (was === 'placed' && o.status === 'preparing') await call(store, 'accept', { ...base, prep_time: +o.wait || 15 });
    else if (was === 'placed' && o.status === 'cancelled') {
      if ((o.cancel || {}).by === 'Zomato') continue; // Zomato cancelled it itself
      const why = (o.cancel || {}).code || 'other';
      await call(store, 'reject', { ...base, reason_code: why, reason: (o.cancel || {}).why || REJECT[why] || REJECT.other });
    } else if (o.status === 'ready' && !['ready', 'done'].includes(was)) await call(store, 'ready', base);
  }
  const res = [...new Set(outlets.filter(x => x.zomatoResId && x.active !== false).map(x => clean(x.zomatoResId, 24)))];
  for (const m of menu) {
    if (!before.menu.has(m.id) || before.menu.get(m.id) === !!m.off) continue;
    for (const r of res) await call(store, 'stock', { res_id: r, item_id: String(m.id), in_stock: !m.off });
  }
}

// Our menu in the shape we send to Zomato: each item with one variant per size, keyed by our ids,
// so Zomato's orders come back with our item and size ids (vendor_entity_id "p1:7")
function menuBody(state, resId) {
  const cats = (state.config.categories || []).concat(state.cats || []);
  return {
    res_id: resId,
    categories: cats.map(c => ({ vendor_entity_id: String(c.id), name: c.label || c.name || String(c.id) })),
    items: state.menu.filter(m => !m.combo && !m.hidden).map(m => {
      const sizes = Object.entries(m.prices || {});
      return {
        vendor_entity_id: String(m.id), category_id: String(m.cat || ''), name: m.name, description: clean(m.desc, 500),
        in_stock: !m.off, veg: m.veg !== false,
        ...(sizes.length ? { variants: sizes.map(([k, p]) => ({ vendor_entity_id: m.id + ':' + k, name: ((state.sizes || []).find(s => String(s.id) === k) || {}).label || k, price: +p })) } : { price: +m.price || 0 }),
      };
    }),
  };
}

/* ---------- routes ---------- */
function routes(app, store, M) {
  const okSecret = req => {
    const want = env().secret;
    const got = String(req.get('x-webhook-secret') || req.get('x-zomato-secret') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.secret || '');
    if (!want || !got) return false;
    const a = Buffer.from(crypto.createHash('sha256').update(got).digest()), b = Buffer.from(crypto.createHash('sha256').update(want).digest());
    return crypto.timingSafeEqual(a, b);
  };

  app.post('/api/zomato/webhook', async (req, res) => {
    if (!okSecret(req)) return res.status(401).json({ error: 'Wrong secret' });
    const z = readOrder(req.body);
    if (!z) return res.status(400).json({ error: 'No order id' });
    const outlets = await store.readCollection('outlets');
    const live = outlets.filter(o => o.active !== false);
    const out = (z.resId && outlets.find(o => clean(o.zomatoResId, 24) === z.resId)) || (!z.resId && live.length === 1 ? live[0] : null);
    if (!out) return res.status(404).json({ error: 'No outlet has Zomato outlet ID ' + (z.resId || '(none sent)') });
    const id = 'zom_' + crypto.createHash('sha256').update(out.id + '|' + z.zid).digest('hex').slice(0, 16);
    const old = (await store.readCollection('orders', { _id: id }))[0];

    if (z.kind === 'new') {
      if (old) return res.json({ ok: true, duplicate: true, orderId: id, no: old.no });
      const [menu, sizes] = await Promise.all([store.readCollection('menu'), store.readCollection('sizes')]);
      const items = toLines(z.items, menu, sizes);
      const subtotal = Math.round(items.reduce((s, l) => s + l.unit * l.qty, 0) * 100) / 100;
      const total = z.total || subtotal, ts = Date.now();
      const o = {
        id, no: '', ts, date: istDate(ts), status: 'placed', source: 'zomato', type: 'zomato', table: '', address: '',
        outletId: out.id, zomatoId: z.zid, customer: { name: z.name, phone: '' }, items, note: z.note,
        subtotal, discounts: subtotal > total ? [{ name: 'Zomato discount', amt: Math.round((subtotal - total) * 100) / 100 }] : [], total,
        pay: { mode: 'zomato', given: 0, change: 0 }, paid: true, paidAt: ts, times: { placed: ts }, wait: 15, by: 'Zomato', extra: {},
      };
      const r = await store.applyChanges({ upsert: { orders: [o] } });
      o.no = r.renumbered[id] || o.no;
      res.json({ ok: true, orderId: id, no: o.no });
      require('./push').notifyNewOrders([o]).catch(e => console.error('Push alert failed:', e.message));
      return;
    }
    if (!old) return res.json({ ok: true, ignored: true, reason: 'Unknown order' });
    if (z.kind === 'cancelled') {
      if (old.status === 'cancelled') return res.json({ ok: true, orderId: id, status: 'cancelled' });
      const at = Date.now();
      const o = { ...old, status: 'cancelled', times: { ...(old.times || {}), cancelled: at }, cancel: { by: 'Zomato', why: 'Cancelled on Zomato', at, was: old.status } };
      await store.applyChanges({ upsert: { orders: [o] } });
      return res.json({ ok: true, orderId: id, status: 'cancelled' });
    }
    const o = { ...old, zrider: { ...(old.zrider || {}), ...Object.fromEntries(Object.entries(z.rider).filter(([, v]) => v)), at: Date.now() } };
    await store.applyChanges({ upsert: { orders: [o] } });
    res.json({ ok: true, orderId: id, status: old.status });
  });

  // What Outlets › Zomato shows: whether we're connected and the last calls
  app.get('/api/zomato/status', async (req, res) => res.json({ connected: connected(), webhook: webhookOn(), reasons: REJECT, log: (await store.getSetting('zomatoLog', [])).slice(0, 20) }));

  // Owner sends the whole menu to Zomato for one outlet (needs the owner PIN)
  app.post('/api/zomato/menu', async (req, res) => {
    const { staffId, pin, outletId } = req.body || {};
    const s = staffId && await M.Staff.findById(String(staffId)).lean();
    if (!s || !['owner', 'oowner'].includes(s.role) || !(await store.checkStaffPin(staffId, pin))) return res.status(403).json({ error: 'Only the owner can send the menu' });
    const { state } = await store.readState();
    const out = state.outlets.find(o => String(o.id) === String(outletId));
    if (!out || !out.zomatoResId) return res.status(400).json({ error: 'Type this outlet\'s Zomato outlet ID first' });
    const body = menuBody(state, clean(out.zomatoResId, 24));
    const r = await call(store, 'menu', body);
    res.json({ ok: r.ok, offline: !!r.offline, msg: r.msg, items: body.items.length });
  });
}

// Before a save: the status of the Zomato orders and the on/off of the menu items it touches
async function beforeSave(store, orders, menu) {
  const before = { orders: new Map(), menu: new Map() };
  const z = orders.filter(o => o.type === 'zomato' && o.source === 'zomato');
  if (z.length) (await store.readCollection('orders', { _id: { $in: z.map(o => String(o.id)) } })).forEach(o => before.orders.set(o.id, o.status));
  if (menu.length) (await store.readCollection('menu', { _id: { $in: menu.map(m => String(m.id)) } })).forEach(m => before.menu.set(m.id, !!m.off));
  return before;
}

module.exports = { routes, readOrder, toLines, menuBody, beforeSave, afterSave, connected, REJECT, istDate };
