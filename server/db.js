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

// Outlet code - date (ddmmyy) - a 3-digit count for that outlet and day, e.g. A-081126-001
const orderNo = (code, date, n) => { const [y, m, d] = String(date).split('-'); return code + '-' + d + m + y.slice(2) + '-' + String(n).padStart(3, '0'); };

/* ---------- PINs ---------- */
// Staff PINs are 6 digits. PINs set before the switch were 4 digits; they are
// kept (as hashes, so they can't be converted) and marked old: the owner of
// one can still sign in with it once, and the app then makes them choose a
// 6-digit PIN before doing anything else. Customer PINs stay 4 digits.
const STAFF_PIN_LEN = 6, OLD_STAFF_PIN_LEN = 4;
const isStaffPin = p => typeof p === 'string' && new RegExp('^\\d{' + STAFF_PIN_LEN + '}$').test(p);
const isOldStaffPin = p => typeof p === 'string' && new RegExp('^\\d{' + OLD_STAFF_PIN_LEN + '}$').test(p);
// A staff record whose PIN hash was made before 6-digit PINs (no pinLen saved)
const hasOldPin = s => !!(s && s.pinHash && s.pinLen !== STAFF_PIN_LEN);

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
  const { _id, _pos, pinHash, pinLen, ...obj } = d;
  if (spec.pin && pinHash) obj.pin = true;
  if (spec === SPECS.users && hasOldPin(d)) obj.pinOld = true; // must choose a 6-digit PIN
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
  async nextOrderNo(outletId, date) {
    const out = await M.Outlet.findById(String(outletId)).lean();
    if (!out || !date) return null;
    // 'no:' counters count orders per outlet and day for this format
    const n = await this.bump('no:' + outletId + '|' + date);
    return orderNo(out.code, date, n);
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
      const existing = new Map((await spec.model.find({ _id: { $in: entries.map(e => e[0]) } }, { _pos: 1, pinHash: 1, pinLen: 1, _rev: 1 }).lean())
        .map(d => [d._id, d]));
      const isNew = entries.filter(([k]) => !existing.has(k)).length;
      let pos = isNew ? await this.bump('pos', isNew) - isNew : 0;
      const ops = [];
      for (const [key, obj] of entries) {
        const old = existing.get(key);
        const oldRev = (old && old._rev) || 0;
        if (old && typeof obj._rev === 'number' && obj._rev < oldRev) { conflicts.push({ coll: name, id: key, no: obj.no || obj.name || key }); continue; }
        const { pin, _newPin, pinOld, pinLen, ...rest } = obj;
        const d = { ...rest, _id: key, _pos: old ? old._pos : ++pos, _rev: oldRev + 1 };
        (revs[name] = revs[name] || {})[key] = d._rev;
        if (spec.pin) {
          // Staff PINs must be exactly 6 digits; anything else keeps the PIN they had
          const okNew = typeof _newPin === 'string' && _newPin && (name !== 'users' || isStaffPin(_newPin));
          if (okNew) {
            d.pinHash = hashPin(_newPin);
            if (name === 'users') d.pinLen = STAFF_PIN_LEN;
          } else if ((pin || _newPin) && old && old.pinHash) {
            d.pinHash = old.pinHash;
            if (old.pinLen) d.pinLen = old.pinLen;
          }
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
  // Checks a staff PIN: 6 digits, or (only with allowOld, for signing in)
  // the old 4-digit PIN of someone who hasn't chosen a 6-digit one yet.
  async checkStaffPin(id, pin, { allowOld = false } = {}) {
    return (await this.staffPin(id, pin, { allowOld })).ok;
  }
  async staffPin(id, pin, { allowOld = false } = {}) {
    const s = await M.Staff.findById(String(id), { pinHash: 1, pinLen: 1 }).lean();
    if (!s) return { ok: false };
    pin = String(pin == null ? '' : pin);
    const old = hasOldPin(s);
    const shapeOk = old ? allowOld && isOldStaffPin(pin) : isStaffPin(pin);
    return { ok: shapeOk && checkPin(pin, s.pinHash), old };
  }

  // One-time switch to 6-digit PINs for the starting staff (Owner, Cashier, Kitchen):
  // if they are still on an old 4-digit PIN, give them their new 6-digit PIN from the
  // starting data. Other staff keep their old PIN until they sign in and choose one.
  async upgradeStarterPins(users) {
    let changed = 0;
    for (const u of users || []) {
      if (!u || !isStaffPin(u._newPin)) continue;
      const s = await M.Staff.findById(String(u.id), { pinHash: 1, pinLen: 1 }).lean();
      if (!hasOldPin(s)) continue;
      await M.Staff.updateOne({ _id: String(u.id) }, { $set: { pinHash: hashPin(u._newPin), pinLen: STAFF_PIN_LEN } });
      changed++;
    }
    if (changed) await this.bump('version');
    return changed;
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

module.exports = { Store, SPECS, COLLECTIONS, hashPin, checkPin, orderNo, STAFF_PIN_LEN };
