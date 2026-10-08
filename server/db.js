// SQLite access for Cheesy Pizza: maps the app's state collections to tables
// and back, applies changes sent by the browser, and checks PINs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

/* ---------- value encoding ---------- */
// Each column has a type. A value whose type does not survive the round trip
// (e.g. a number typed into a text box) is also kept in `extra`, so reading a
// record back always gives the same object the app saved.
const ENC = {
  text: v => String(v),
  num: v => (typeof v === 'number' ? v : v === '' || isNaN(+v) ? null : +v),
  int: v => (typeof v === 'number' ? Math.round(v) : v === '' || isNaN(+v) ? null : Math.round(+v)),
  bool: v => (v ? 1 : 0),
  json: v => JSON.stringify(v),
  any: v => (typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'object' ? JSON.stringify(v) : v),
};
const DEC = {
  text: v => v,
  num: v => v,
  int: v => v,
  bool: v => !!v,
  json: v => JSON.parse(v),
  any: v => v,
};
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  let x = o;
  ks.slice(0, -1).forEach(k => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; });
  x[ks[ks.length - 1]] = v;
}
function delPath(o, p) {
  const ks = p.split('.');
  const x = getPath(o, ks.slice(0, -1).join('.')) ?? (ks.length === 1 ? o : undefined);
  if (x && typeof x === 'object') delete x[ks[ks.length - 1]];
}

/* ---------- collection specs ---------- */
// cols: [path in the app object, column, type]
const SPECS = {
  sizes: {
    table: 'sizes', pk: 'id', shape: 'array',
    cols: [['id', 'id', 'text'], ['label', 'label', 'text'], ['pcs', 'pcs', 'int']],
  },
  outlets: {
    table: 'outlets', pk: 'id', shape: 'array',
    cols: [['id', 'id', 'text'], ['code', 'code', 'text'], ['name', 'name', 'text'], ['area', 'area', 'text'],
      ['phone', 'phone', 'text'], ['upi', 'upi', 'text'], ['tables', 'tables', 'int']],
    children: [{ key: 'riders', table: 'outlet_riders', fk: 'outlet_id', kind: 'list',
      cols: [['name', 'name', 'text'], ['phone', 'phone', 'text']] }],
  },
  menu: {
    table: 'menu_items', pk: 'id', shape: 'array',
    cols: [['id', 'id', 'text'], ['cat', 'cat', 'text'], ['name', 'name', 'text'], ['desc', 'description', 'text'],
      ['img', 'img', 'text'], ['price', 'price', 'num'], ['jain', 'jain', 'int'], ['spicy', 'spicy', 'int'], ['best', 'best', 'int']],
    children: [{ key: 'prices', table: 'menu_item_prices', fk: 'item_id', kind: 'map', mapKey: 'size_id', valueCol: 'price' }],
  },
  addons: {
    table: 'addons', pk: 'id', shape: 'map',
    cols: [['name', 'name', 'text']],
    children: [{ key: 'prices', table: 'addon_prices', fk: 'addon_id', kind: 'map', mapKey: 'size_id', valueCol: 'price' }],
  },
  offers: {
    table: 'offers', pk: 'id', shape: 'array',
    cols: [['id', 'id', 'text'], ['type', 'type', 'text'], ['name', 'name', 'text'], ['code', 'code', 'text'],
      ['kind', 'kind', 'text'], ['value', 'value', 'num'], ['pct', 'pct', 'num'], ['min', 'min_order', 'num'],
      ['cap', 'cap', 'num'], ['scope', 'scope', 'text'], ['size', 'size', 'text'], ['itemId', 'item_id', 'text'],
      ['days', 'days', 'json'], ['once', 'once', 'bool'], ['firstOnly', 'first_only', 'bool'], ['until', 'until', 'text'],
      ['active', 'active', 'bool']],
  },
  combos: {
    table: 'combos', pk: 'id', shape: 'array',
    cols: [['id', 'id', 'text'], ['name', 'name', 'text'], ['desc', 'description', 'text'], ['price', 'price', 'num'],
      ['pizzas', 'pizzas', 'int'], ['size', 'size', 'text'], ['tier', 'tier', 'num'], ['extras', 'extras', 'json'],
      ['active', 'active', 'bool']],
  },
  users: {
    table: 'staff', pk: 'id', shape: 'array', pin: true,
    cols: [['id', 'id', 'text'], ['name', 'name', 'text'], ['role', 'role', 'text']],
  },
  customers: {
    table: 'customers', pk: 'phone', shape: 'map', pin: true,
    cols: [['phone', 'phone', 'text'], ['name', 'name', 'text'], ['wallet', 'wallet', 'num'], ['coins', 'coins', 'num'],
      ['due', 'due', 'num'], ['ref', 'ref', 'text'], ['bday', 'bday', 'text'], ['addr', 'addr', 'text'],
      ['joined', 'joined', 'int'], ['refBy', 'ref_by', 'text'], ['spinDate', 'spin_date', 'text']],
    children: [
      { key: 'tx', table: 'customer_tx', fk: 'phone', kind: 'list',
        cols: [['ts', 'ts', 'int'], ['kind', 'kind', 'text'], ['amt', 'amt', 'num'], ['note', 'note', 'text']] },
      { key: 'myCodes', table: 'customer_codes', fk: 'phone', kind: 'list',
        cols: [['code', 'code', 'text'], ['name', 'name', 'text'], ['kind', 'kind', 'text'], ['value', 'value', 'num'],
          ['min', 'min_order', 'num'], ['cap', 'cap', 'num'], ['until', 'until', 'text'], ['used', 'used', 'bool']] },
    ],
  },
  orders: {
    table: 'orders', pk: 'id', shape: 'array',
    cols: [['id', 'id', 'text'], ['no', 'no', 'text'], ['outletId', 'outlet_id', 'text'], ['date', 'date', 'text'],
      ['ts', 'ts', 'int'], ['status', 'status', 'text'], ['source', 'source', 'text'], ['type', 'type', 'text'],
      ['table', 'table_no', 'text'], ['address', 'address', 'text'], ['customer.name', 'customer_name', 'text'],
      ['customer.phone', 'customer_phone', 'text'], ['pay.mode', 'pay_mode', 'text'], ['pay.given', 'pay_given', 'num'],
      ['pay.change', 'pay_change', 'num'], ['paid', 'paid', 'bool'], ['subtotal', 'subtotal', 'num'],
      ['total', 'total', 'num'], ['rating', 'rating', 'int']],
    children: [{ key: 'items', table: 'order_items', fk: 'order_id', kind: 'list',
      cols: [['itemId', 'item_id', 'text'], ['cat', 'cat', 'text'], ['name', 'name', 'text'], ['size', 'size', 'text'],
        ['qty', 'qty', 'int'], ['unit', 'unit', 'num']] }],
  },
};
// Order matters: outlets before orders so new orders can be numbered.
const COLLECTIONS = ['sizes', 'outlets', 'menu', 'addons', 'offers', 'combos', 'users', 'customers', 'orders'];

/* ---------- object <-> row ---------- */
function encode(obj, cols, skipKeys = []) {
  const rest = JSON.parse(JSON.stringify(obj));
  skipKeys.forEach(k => delete rest[k]);
  const row = {};
  for (const [p, col, type] of cols) {
    const v = getPath(obj, p);
    if (v === undefined || v === null) { row[col] = null; continue; }
    const enc = ENC[type](v);
    row[col] = enc;
    if (enc !== null && same(DEC[type](enc), v)) delPath(rest, p);
  }
  row.extra = Object.keys(rest).length ? JSON.stringify(rest) : null;
  return row;
}
function decode(row, cols) {
  const obj = row.extra ? JSON.parse(row.extra) : {};
  for (const [p, col, type] of cols) {
    if (row[col] === null || row[col] === undefined) continue;
    if (getPath(obj, p) !== undefined) continue;
    setPath(obj, p, DEC[type](row[col]));
  }
  return obj;
}

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

/* ---------- database ---------- */
class Store {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  }

  getSetting(key, dflt) {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? JSON.parse(r.value) : dflt;
  }
  setSetting(key, value) {
    this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }
  version() { return this.getSetting('version', 0); }
  isSeeded() { return !!this.getSetting('seeded', false); }

  /* ----- read ----- */
  readCollection(name, where = '', params = []) {
    const spec = SPECS[name];
    const rows = this.db.prepare(`SELECT * FROM ${spec.table} ${where} ORDER BY rowid`).all(...params);
    const childRows = (spec.children || []).map(ch => {
      const by = new Map();
      const all = rows.length ? this.db.prepare(
        `SELECT * FROM ${ch.table} WHERE ${ch.fk} IN (SELECT ${spec.pk} FROM ${spec.table} ${where})
         ORDER BY ${ch.kind === 'list' ? 'pos' : 'rowid'}`).all(...params) : [];
      all.forEach(r => { if (!by.has(r[ch.fk])) by.set(r[ch.fk], []); by.get(r[ch.fk]).push(r); });
      return by;
    });
    const out = spec.shape === 'map' ? {} : [];
    for (const row of rows) {
      const obj = decode(row, spec.cols);
      (spec.children || []).forEach((ch, i) => {
        const list = childRows[i].get(row[spec.pk]);
        if (!list) return;
        if (ch.kind === 'list') obj[ch.key] = list.map(r => decode(r, ch.cols));
        else obj[ch.key] = Object.fromEntries(list.map(r => [r[ch.mapKey], r[ch.valueCol]]));
      });
      if (spec.pin && row.pin_hash) obj.pin = true;
      if (spec.shape === 'map') out[row[spec.pk]] = obj; else out.push(obj);
    }
    return out;
  }

  readConfig() {
    const db = this.db;
    return {
      categories: db.prepare('SELECT id, label, label_gu AS labelGu FROM categories ORDER BY sort').all(),
      orderTypes: db.prepare('SELECT id, label FROM order_types ORDER BY sort').all(),
      payModes: db.prepare('SELECT id, label, color FROM payment_modes ORDER BY sort').all(),
      ...this.getSetting('config', {}),
    };
  }

  readSeq() {
    const seq = {};
    this.db.prepare('SELECT * FROM order_seq').all().forEach(r => { seq[r.outlet_id + '|' + r.date] = r.last; });
    return seq;
  }

  readState() {
    const state = {};
    COLLECTIONS.forEach(c => { state[c] = this.readCollection(c); });
    state.seq = this.readSeq();
    state.config = this.readConfig();
    return { version: this.version(), demoPending: !!this.getSetting('demoPending', false), state };
  }

  /* ----- write ----- */
  upsertOne(name, key, obj, renumbered) {
    const spec = SPECS[name];
    // Empty lists/maps stay in `extra` so they read back as [] / {}
    const skip = (spec.children || []).filter(ch => obj[ch.key] && typeof obj[ch.key] === 'object' && Object.keys(obj[ch.key]).length).map(ch => ch.key);
    if (spec.pin) skip.push('pin', '_newPin');
    if (name === 'orders') {
      const exists = this.db.prepare('SELECT 1 FROM orders WHERE id = ?').get(key);
      if (!exists) {
        const no = this.nextOrderNo(obj.outletId, obj.date);
        if (no && no !== obj.no) { obj = { ...obj, no }; renumbered[key] = no; }
      }
    }
    const row = encode(obj, spec.cols, skip);
    row[spec.pk] = key;
    const cols = Object.keys(row);
    this.db.prepare(
      `INSERT INTO ${spec.table} (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})
       ON CONFLICT(${spec.pk}) DO UPDATE SET ${cols.filter(c => c !== spec.pk).map(c => `${c} = excluded.${c}`).join(',')}`
    ).run(row);

    if (spec.pin) {
      if (typeof obj._newPin === 'string' && obj._newPin) {
        this.db.prepare(`UPDATE ${spec.table} SET pin_hash = ? WHERE ${spec.pk} = ?`).run(hashPin(obj._newPin), key);
      } else if (!obj.pin) {
        this.db.prepare(`UPDATE ${spec.table} SET pin_hash = NULL WHERE ${spec.pk} = ?`).run(key);
      }
    }

    for (const ch of spec.children || []) {
      this.db.prepare(`DELETE FROM ${ch.table} WHERE ${ch.fk} = ?`).run(key);
      const val = obj[ch.key];
      if (!val || typeof val !== 'object') continue;
      if (ch.kind === 'list') {
        val.forEach((item, pos) => {
          const r = encode(item, ch.cols);
          r[ch.fk] = key; r.pos = pos;
          const cs = Object.keys(r);
          this.db.prepare(`INSERT INTO ${ch.table} (${cs.join(',')}) VALUES (${cs.map(c => '@' + c).join(',')})`).run(r);
        });
      } else {
        Object.entries(val).forEach(([k, v]) => {
          this.db.prepare(`INSERT INTO ${ch.table} (${ch.fk}, ${ch.mapKey}, ${ch.valueCol}) VALUES (?, ?, ?)`).run(key, k, ENC.any(v));
        });
      }
    }
  }

  deleteOne(name, key) {
    const spec = SPECS[name];
    for (const ch of spec.children || []) this.db.prepare(`DELETE FROM ${ch.table} WHERE ${ch.fk} = ?`).run(key);
    this.db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.pk} = ?`).run(key);
  }

  nextOrderNo(outletId, date) {
    const out = this.db.prepare('SELECT code FROM outlets WHERE id = ?').get(outletId);
    if (!out || !date) return null;
    const r = this.db.prepare('SELECT last FROM order_seq WHERE outlet_id = ? AND date = ?').get(outletId, date);
    const n = (r ? r.last : 0) + 1;
    this.db.prepare('INSERT INTO order_seq(outlet_id, date, last) VALUES (?, ?, ?) ON CONFLICT(outlet_id, date) DO UPDATE SET last = excluded.last')
      .run(outletId, date, n);
    return out.code + '-' + String(n).padStart(3, '0');
  }

  // changes: { upsert: { coll: [obj] | {key: obj} }, delete: { coll: [key] } }
  applyChanges(changes) {
    const renumbered = {};
    let prev, version;
    this.db.transaction(() => {
      const up = changes.upsert || {};
      const del = changes.delete || {};
      for (const name of COLLECTIONS) {
        const spec = SPECS[name];
        (del[name] || []).forEach(key => this.deleteOne(name, String(key)));
        const items = up[name];
        if (!items) continue;
        const entries = Array.isArray(items) ? items.map(o => [o[spec.pk], o]) : Object.entries(items);
        entries.forEach(([key, obj]) => {
          if (key === undefined || key === null || key === '' || !obj || typeof obj !== 'object') throw new Error(`Bad ${name} record`);
          this.upsertOne(name, String(key), obj, renumbered);
        });
      }
      prev = this.version();
      version = prev + 1;
      this.setSetting('version', version);
    })();
    return { prev, version, renumbered, seq: this.readSeq() };
  }

  /* ----- auth ----- */
  checkCustomerPin(phone, pin) {
    const r = this.db.prepare('SELECT pin_hash FROM customers WHERE phone = ?').get(String(phone));
    return !!r && checkPin(pin, r.pin_hash);
  }
  checkStaffPin(id, pin) {
    const r = this.db.prepare('SELECT pin_hash FROM staff WHERE id = ?').get(String(id));
    return !!r && checkPin(pin, r.pin_hash);
  }

  /* ----- seeding ----- */
  wipe() {
    this.db.transaction(() => {
      ['order_items', 'orders', 'order_seq', 'customer_tx', 'customer_codes', 'customers', 'staff', 'combos', 'offers',
        'addon_prices', 'addons', 'menu_item_prices', 'menu_items', 'outlet_riders', 'outlets', 'sizes',
        'payment_modes', 'order_types', 'categories'].forEach(t => this.db.exec(`DELETE FROM ${t}`));
      this.db.exec("DELETE FROM settings WHERE key <> 'version'");
    })();
  }

  seed(data, { demoOrders = true } = {}) {
    this.wipe();
    const db = this.db;
    db.transaction(() => {
      data.categories.forEach((c, i) => db.prepare('INSERT INTO categories VALUES (?, ?, ?, ?)').run(c.id, c.label, c.labelGu || null, i));
      data.orderTypes.forEach((t, i) => db.prepare('INSERT INTO order_types VALUES (?, ?, ?)').run(t.id, t.label, i));
      data.payModes.forEach((p, i) => db.prepare('INSERT INTO payment_modes VALUES (?, ?, ?, ?)').run(p.id, p.label, p.color, i));
      this.setSetting('config', data.config);
      this.setSetting('demoPending', !!demoOrders);
      this.setSetting('seeded', true);
    })();
    this.applyChanges({ upsert: data.state });
  }

  // The first browser to call this generates the demo orders.
  claimDemo() {
    return this.db.transaction(() => {
      if (!this.getSetting('demoPending', false)) return false;
      this.setSetting('demoPending', false);
      return true;
    })();
  }
}

module.exports = { Store, SPECS, COLLECTIONS, encode, decode, hashPin, checkPin };
