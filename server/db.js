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
  users: { model: M.Staff, key: 'id', pin: true },
  customers: { model: M.Customer, map: true, pin: true },
  orders: { model: M.Order, key: 'id' },
};
// Order matters: outlets before orders so new orders can be numbered.
const COLLECTIONS = Object.keys(SPECS);

/* ---------- PINs ---------- */
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
    (await M.Counter.find({ _id: /^seq:/ }).lean()).forEach(c => { seq[c._id.slice(4)] = c.n; });
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
  async nextOrderNo(outletId, date) {
    const out = await M.Outlet.findById(String(outletId)).lean();
    if (!out || !date) return null;
    const n = await this.bump('seq:' + outletId + '|' + date);
    return out.code + '-' + String(n).padStart(3, '0');
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
      const existing = new Map((await spec.model.find({ _id: { $in: entries.map(e => e[0]) } }, { _pos: 1, pinHash: 1 }).lean())
        .map(d => [d._id, d]));
      const isNew = entries.filter(([k]) => !existing.has(k)).length;
      let pos = isNew ? await this.bump('pos', isNew) - isNew : 0;
      const ops = [];
      for (const [key, obj] of entries) {
        const old = existing.get(key);
        const { pin, _newPin, ...rest } = obj;
        const d = { ...rest, _id: key, _pos: old ? old._pos : ++pos };
        if (spec.pin) {
          if (typeof _newPin === 'string' && _newPin) d.pinHash = hashPin(_newPin);
          else if (pin && old && old.pinHash) d.pinHash = old.pinHash;
        }
        if (name === 'orders' && !old) {
          const no = await this.nextOrderNo(obj.outletId, obj.date);
          if (no && no !== obj.no) { d.no = no; renumbered[key] = no; }
        }
        ops.push({ replaceOne: { filter: { _id: key }, replacement: d, upsert: true } });
      }
      if (ops.length) await spec.model.bulkWrite(ops, { ordered: true });
    }
    const version = await this.bump('version');
    return { prev: version - 1, version, renumbered, seq: await this.readSeq() };
  }

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
    await this.applyChanges({ upsert: data.state });
    await this.setSetting('seeded', true);
  }

  // The first browser to call this generates the demo orders.
  async claimDemo() {
    const r = await M.Setting.findOneAndUpdate({ _id: 'demoPending', value: true }, { $set: { value: false } }).lean();
    return !!r;
  }
}

module.exports = { Store, SPECS, COLLECTIONS, hashPin, checkPin };
