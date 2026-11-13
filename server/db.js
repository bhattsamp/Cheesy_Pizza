// MongoDB access for Cheesy Pizza: reads the app's state from the collections,
// applies changes sent by the browser, numbers new orders and checks PINs.
const crypto = require('crypto');
const mongoose = require('mongoose');
const M = require('./models');

// App state key -> model, how records are keyed, and whether it is a map
const SPECS = {
  sizes: { model: M.Size, key: 'id' },
  outlets: { model: M.Outlet, key: 'id' },
  menu: { model: M.MenuItem, key: 'id' },
  addons: { model: M.Addon, map: true },
  offers: { model: M.Offer, key: 'id' },
  combos: { model: M.Combo, key: 'id' },
  extras: { model: M.ExtraMenu, key: 'id' },
  cats: { model: M.CustomCategory, key: 'id' }, // categories the owner adds, shown after the built-in ones
  users: { model: M.Staff, key: 'id', pin: true },
  customers: { model: M.Customer, map: true, pin: true },
  orders: { model: M.Order, key: 'id' },
  upialerts: { model: M.UpiAlert, key: 'id' }, // UPI payments read from the shop phone's UPI app alerts
};
// Order matters: outlets before orders so new orders can be numbered.
const COLLECTIONS = Object.keys(SPECS);

/* ---------- PINs ---------- */
// Outlet code - a running count for that outlet that never resets, e.g. A-122
const orderNo = (code, n) => code + '-' + n;

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt:' + salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
function checkPin(pin, stored) {
  if (!stored) return false;
  const [, salt, hash] = stored.split(':');
  const got = crypto.scryptSync(String(pin), salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// Turn a stored document back into the object the app saved
function toApp(d, spec) {
  const { _id, _pos, pinHash, ...obj } = d;
  if (spec.pin && pinHash) obj.pin = true;
  return obj;
}

class Store {
  async connect(uri) {
    this.conn = await mongoose.connect(uri);
    await Promise.all(Object.values(M).map(m => m.init()));
    return this;
  }
  close() { return mongoose.disconnect(); }

  async getSetting(key, dflt) {
    const s = await M.Setting.findById(key).lean();
    return s ? s.value : dflt;
  }
  setSetting(key, value) { return M.Setting.updateOne({ _id: key }, { $set: { value } }, { upsert: true }); }
  async version() { return (await M.Counter.findById('version').lean())?.n || 0; }
  async isSeeded() { return !!(await this.getSetting('seeded', false)); }
  async bump(id, by = 1) {
    const c = await M.Counter.findOneAndUpdate({ _id: id }, { $inc: { n: by } }, { upsert: true, returnDocument: 'after' }).lean();
    return c.n;
  }

  /* ----- read ----- */
  async readCollection(name, filter = {}) {
    const spec = SPECS[name];
    const docs = await spec.model.find(filter).sort({ _pos: 1 }).lean();
    if (spec.map) return Object.fromEntries(docs.map(d => [d._id, toApp(d, spec)]));
    return docs.map(d => toApp(d, spec));
  }

  async readConfig() {
    const list = async (model) => (await model.find().sort({ _pos: 1 }).lean()).map(({ _id, _pos, ...r }) => ({ id: _id, ...r }));
    return {
      categories: await list(M.Category),
      orderTypes: await list(M.OrderType),
      payModes: await list(M.PaymentMode),
      ...(await this.getSetting('config', {})),
    };
  }

  async readSeq() {
    const seq = {};
    (await M.Counter.find({ _id: /^no:/ }).lean()).forEach(c => { seq[c._id.slice(3)] = c.n; });
    return seq;
  }

  async readState() {
    const state = {};
    for (const c of COLLECTIONS) state[c] = await this.readCollection(c);
    state.seq = await this.readSeq();
    state.config = await this.readConfig();
    return { version: await this.version(), demoPending: !!(await this.getSetting('demoPending', false)), state };
  }

  /* ----- write ----- */
  async nextOrderNo(outletId) {
    const out = await M.Outlet.findById(String(outletId)).lean();
    if (!out) return null;
    // One 'no:<outlet>' counter per outlet, counting up for good
    const n = await this.bump('no:' + outletId);
    return orderNo(out.code, n);
  }

  // One-time switch from A-ddmmyy-001 numbers to running numbers. A full backup is saved first
  // (Reports › Backup & export, named before-order-numbers-...), then every outlet's orders get
  // A-1, A-2, ... by the time they were placed, the old number is kept as oldNo, and the counter
  // carries on from the last one. UPI alerts linked to an order get its new number too.
  migrateRunningNos() {
    const run = (this.queue || Promise.resolve()).then(() => this._migrateRunningNos());
    this.queue = run.catch(() => {});
    return run;
  }
  async _migrateRunningNos() {
    if (await this.getSetting('runningNos', false)) return null;
    const zlib = require('zlib');
    const { state, version } = await this.readState();
    if (state.orders.length) {
      const data = zlib.gzipSync(JSON.stringify({ exportedAt: new Date().toISOString(), version, ...state }));
      if (data.length > 15 * 1024 * 1024) throw new Error('backup too big to save, order numbers left as they are');
      const id = 'before-order-numbers-' + new Date().toISOString().slice(0, 10);
      await M.Backup.updateOne({ _id: id }, { $setOnInsert: { data, size: data.length, ts: Date.now() } }, { upsert: true });
    }
    const outlets = new Map(state.outlets.map(o => [String(o.id), o]));
    const docs = await M.Order.find({}, { outletId: 1, ts: 1, no: 1, _pos: 1 }).lean();
    docs.sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a._pos || 0) - (b._pos || 0));
    const count = {}, newNo = {}, ops = [];
    for (const d of docs) {
      const out = outlets.get(String(d.outletId));
      if (!out) continue;
      const k = String(d.outletId);
      count[k] = (count[k] || 0) + 1;
      const no = orderNo(out.code, count[k]);
      newNo[d._id] = no;
      if (no !== d.no) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { no, oldNo: d.no }, $inc: { _rev: 1 } } } });
    }
    if (ops.length) await M.Order.bulkWrite(ops, { ordered: false });
    const ua = (await M.UpiAlert.find({ orderId: { $in: Object.keys(newNo) } }, { orderId: 1, orderNo: 1 }).lean())
      .filter(a => a.orderNo !== newNo[a.orderId])
      .map(a => ({ updateOne: { filter: { _id: a._id }, update: { $set: { orderNo: newNo[a.orderId] }, $inc: { _rev: 1 } } } }));
    if (ua.length) await M.UpiAlert.bulkWrite(ua, { ordered: false });
    await M.Counter.deleteMany({ _id: /^no:.*\|/ }); // the old per-day counters
    for (const [k, n] of Object.entries(count)) await M.Counter.updateOne({ _id: 'no:' + k }, { $set: { n } }, { upsert: true });
    await this.setSetting('runningNos', true);
    await this.bump('version');
    return { orders: ops.length, upiAlerts: ua.length, last: count };
  }

  // Saves run one at a time in this server, so two tills saving together
  // can't interleave their bill numbers or change counts.
  applyChanges(changes) {
    const run = (this.queue || Promise.resolve()).then(() => this._apply(changes));
    this.queue = run.catch(() => {});
    return run;
  }

  // changes: { upsert: { coll: [obj] | {key: obj} }, delete: { coll: [key] } }
  async _apply(changes) {
    const renumbered = {};
    // Each record carries _rev, bumped on every save. A device sends the _rev it last saw; if another
    // device saved that record since, this save is refused for that record (it would wipe the other
    // device's change) and the device is told, so it reloads the record. Saves without _rev (older apps)
    // are accepted as before.
    const revs = {}, conflicts = [];
    const up = changes.upsert || {};
    const del = changes.delete || {};
    // Validate everything before writing anything
    const batches = {};
    for (const name of COLLECTIONS) {
      const spec = SPECS[name];
      const items = up[name];
      if (!items) continue;
      const entries = Array.isArray(items) ? items.map(o => [o && o[spec.key], o]) : Object.entries(items);
      entries.forEach(([key, obj]) => {
        if (key === undefined || key === null || key === '' || !obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`Bad ${name} record`);
      });
      batches[name] = entries.map(([k, o]) => [String(k), o]);
    }

    for (const name of COLLECTIONS) {
      const spec = SPECS[name];
      if ((del[name] || []).length) await spec.model.deleteMany({ _id: { $in: del[name].map(String) } });
      const entries = batches[name];
      if (!entries) continue;
      const existing = new Map((await spec.model.find({ _id: { $in: entries.map(e => e[0]) } }, { _pos: 1, pinHash: 1, _rev: 1 }).lean())
        .map(d => [d._id, d]));
      const isNew = entries.filter(([k]) => !existing.has(k)).length;
      let pos = isNew ? await this.bump('pos', isNew) - isNew : 0;
      const ops = [];
      for (const [key, obj] of entries) {
        const old = existing.get(key);
        const oldRev = (old && old._rev) || 0;
        if (old && typeof obj._rev === 'number' && obj._rev < oldRev) { conflicts.push({ coll: name, id: key, no: obj.no || obj.name || key }); continue; }
        const { pin, _newPin, ...rest } = obj;
        const d = { ...rest, _id: key, _pos: old ? old._pos : ++pos, _rev: oldRev + 1 };
        (revs[name] = revs[name] || {})[key] = d._rev;
        if (spec.pin) {
          if (typeof _newPin === 'string' && _newPin) d.pinHash = hashPin(_newPin);
          else if (pin && old && old.pinHash) d.pinHash = old.pinHash;
        }
        if (name === 'orders' && !old) {
          const no = await this.nextOrderNo(obj.outletId);
          if (no && no !== obj.no) { d.no = no; renumbered[key] = no; }
        }
        ops.push({ replaceOne: { filter: { _id: key }, replacement: d, upsert: true } });
      }
      if (ops.length) await spec.model.bulkWrite(ops, { ordered: true });
    }
    const version = await this.bump('version');
    return { prev: version - 1, version, renumbered, revs, conflicts, seq: await this.readSeq() };
  }

  /* ----- uploaded photos ----- */
  async saveImage(type, data) {
    const id = crypto.randomBytes(12).toString('hex');
    await M.Image.create({ _id: id, type, data, ts: Date.now() });
    return id;
  }
  async getImage(id) { return M.Image.findById(String(id)).lean(); }

  /* ----- auth ----- */
  async checkCustomerPin(phone, pin) {
    const c = await M.Customer.findById(String(phone), { pinHash: 1 }).lean();
    return !!c && checkPin(pin, c.pinHash);
  }
  async checkStaffPin(id, pin) {
    const s = await M.Staff.findById(String(id), { pinHash: 1 }).lean();
    return !!s && checkPin(pin, s.pinHash);
  }

  /* ----- seeding ----- */
  async wipe() {
    for (const m of Object.values(M)) {
      if (m === M.Backup) continue; // daily backups survive a reseed
      if (m === M.Counter) await m.deleteMany({ _id: { $ne: 'version' } });
      else await m.deleteMany({});
    }
  }

  async seed(data, { demoOrders = true } = {}) {
    await this.wipe();
    const withPos = list => list.map(({ id, ...r }, i) => ({ _id: id, _pos: i, ...r }));
    await M.Category.insertMany(withPos(data.categories));
    await M.OrderType.insertMany(withPos(data.orderTypes));
    await M.PaymentMode.insertMany(withPos(data.payModes));
    await this.setSetting('config', data.config);
    await this.setSetting('demoPending', !!demoOrders);
    const extras = (data.state.extras || []).map(g => ({ ...g, items: g.items.map(({ from, ...it }) => it) }));
    await this.applyChanges({ upsert: { ...data.state, extras } });
    await this.setSetting('seeded', true);
    await this.setSetting('runningNos', true);
    await this.setSetting('extrasAdded', true);
  }

  // Databases made before extra menus existed get them once, built from the
  // old Extra Veg Topping and Extra Cheese add-ons and their prices.
  async addExtraMenus(defaults) {
    if (await this.getSetting('extrasAdded', false)) return;
    if (!(await M.ExtraMenu.countDocuments())) {
      const addons = await this.readCollection('addons');
      const menus = defaults.map(g => ({ ...g, items: g.items.map(it => {
        const from = addons[it.from];
        const { from: _, ...rest } = it;
        return from ? { ...rest, prices: { ...from.prices } } : rest;
      }) }));
      menus.forEach(g => { if (g.id === 'xveg' && addons.veg?.choices) g.items = addons.veg.choices.map(n => ({ name: n, prices: { ...addons.veg.prices } })); });
      await this.applyChanges({ upsert: { extras: menus } });
    }
    await this.setSetting('extrasAdded', true);
  }

  // The first browser to call this generates the demo orders.
  async claimDemo() {
    const r = await M.Setting.findOneAndUpdate({ _id: 'demoPending', value: true }, { $set: { value: false } }).lean();
    return !!r;
  }
}

module.exports = { Store, SPECS, COLLECTIONS, hashPin, checkPin, orderNo };
