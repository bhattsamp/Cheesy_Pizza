-- Cheesy Pizza database schema (SQLite).
-- Columns hold the fields the app queries and edits; `extra` keeps any other
-- fields of a record as JSON so nothing the app stores is lost.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);

-- Lookup tables shown in the app (were hardcoded constants)
CREATE TABLE IF NOT EXISTS categories (
  id       TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  label_gu TEXT,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_types (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_modes (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sizes (
  id    TEXT PRIMARY KEY,
  label TEXT,
  pcs   INTEGER,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS outlets (
  id     TEXT PRIMARY KEY,
  code   TEXT,
  name   TEXT,
  area   TEXT,
  phone  TEXT,
  upi    TEXT,
  tables INTEGER,
  extra  TEXT
);

CREATE TABLE IF NOT EXISTS outlet_riders (
  outlet_id TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  pos       INTEGER NOT NULL,
  name      TEXT,
  phone     TEXT,
  extra     TEXT,
  PRIMARY KEY (outlet_id, pos)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          TEXT PRIMARY KEY,
  cat         TEXT,
  name        TEXT,
  description TEXT,
  img         TEXT,
  price       REAL,               -- single-price items; pizzas use menu_item_prices
  jain        INTEGER,
  spicy       INTEGER,
  best        INTEGER,
  extra       TEXT
);

CREATE TABLE IF NOT EXISTS menu_item_prices (
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  size_id TEXT NOT NULL,
  price,                          -- untyped: kept exactly as entered
  PRIMARY KEY (item_id, size_id)
);

CREATE TABLE IF NOT EXISTS addons (
  id    TEXT PRIMARY KEY,
  name  TEXT,
  extra TEXT
);

CREATE TABLE IF NOT EXISTS addon_prices (
  addon_id TEXT NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  size_id  TEXT NOT NULL,
  price,
  PRIMARY KEY (addon_id, size_id)
);

CREATE TABLE IF NOT EXISTS offers (
  id         TEXT PRIMARY KEY,
  type       TEXT,                -- day | bogo | item | code
  name       TEXT,
  code       TEXT,
  kind       TEXT,                -- flat | pct
  value      REAL,
  pct        REAL,
  min_order  REAL,
  cap        REAL,
  scope      TEXT,
  size       TEXT,
  item_id    TEXT,
  days       TEXT,                -- JSON array of weekdays, 0 = Sunday
  once       INTEGER,
  first_only INTEGER,
  until      TEXT,
  active     INTEGER,
  extra      TEXT
);

CREATE TABLE IF NOT EXISTS combos (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  description TEXT,
  price       REAL,
  pizzas      INTEGER,
  size        TEXT,
  tier        REAL,
  extras      TEXT,               -- JSON array of menu item ids
  active      INTEGER,
  extra       TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  id       TEXT PRIMARY KEY,
  name     TEXT,
  role     TEXT,                  -- owner | manager | cashier | kitchen
  pin_hash TEXT,
  extra    TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  phone     TEXT PRIMARY KEY,
  name      TEXT,
  pin_hash  TEXT,
  wallet    REAL,
  coins     REAL,
  due       REAL,
  ref       TEXT,
  bday      TEXT,
  addr      TEXT,
  joined    INTEGER,
  ref_by    TEXT,
  spin_date TEXT,
  extra     TEXT
);

CREATE TABLE IF NOT EXISTS customer_tx (
  phone TEXT NOT NULL REFERENCES customers(phone) ON DELETE CASCADE,
  pos   INTEGER NOT NULL,          -- 0 = newest
  ts    INTEGER,
  kind  TEXT,                      -- wallet | coins
  amt   REAL,
  note  TEXT,
  extra TEXT,
  PRIMARY KEY (phone, pos)
);

CREATE TABLE IF NOT EXISTS customer_codes (
  phone     TEXT NOT NULL REFERENCES customers(phone) ON DELETE CASCADE,
  pos       INTEGER NOT NULL,
  code      TEXT,
  name      TEXT,
  kind      TEXT,
  value     REAL,
  min_order REAL,
  cap       REAL,
  until     TEXT,
  used      INTEGER,
  extra     TEXT,
  PRIMARY KEY (phone, pos)
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  no             TEXT,
  outlet_id      TEXT,
  date           TEXT,
  ts             INTEGER,
  status         TEXT,            -- placed | preparing | ready | out | done | cancelled
  source         TEXT,            -- pos | online
  type           TEXT,
  table_no       TEXT,
  address        TEXT,
  customer_name  TEXT,
  customer_phone TEXT,
  pay_mode       TEXT,
  pay_given      REAL,
  pay_change     REAL,
  paid           INTEGER,
  subtotal       REAL,
  total          REAL,
  rating         INTEGER,
  extra          TEXT
);
CREATE INDEX IF NOT EXISTS orders_outlet_date ON orders(outlet_id, date);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pos      INTEGER NOT NULL,
  item_id  TEXT,
  cat      TEXT,
  name     TEXT,
  size     TEXT,
  qty      INTEGER,
  unit     REAL,
  extra    TEXT,
  PRIMARY KEY (order_id, pos)
);

-- Running bill number per outlet per day (A-001, A-002, ...)
CREATE TABLE IF NOT EXISTS order_seq (
  outlet_id TEXT NOT NULL,
  date      TEXT NOT NULL,
  last      INTEGER NOT NULL,
  PRIMARY KEY (outlet_id, date)
);
