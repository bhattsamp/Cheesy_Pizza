const test = require('node:test');
const assert = require('node:assert');
const { invoicePage, when } = require('../server/invoice');

test('invoice page shows the bill and hides most of the phone number', () => {
  const o = { id: 'ord1', no: 'A-012', ts: Date.UTC(2026, 9, 15, 18, 41), type: 'takeaway', customer: { name: 'Vijay <b>', phone: '9876543210' },
    items: [{ qty: 2, name: 'Margherita', unit: 150, size: 's7', addons: ['x'] }], subtotal: 300, discounts: [{ name: 'Tuesday 10%', amt: 30 }], total: 270, paid: true, pay: { mode: 'upi' } };
  const h = invoicePage(o, { name: 'Main Outlet', area: 'Nadiad' }, { sizes: [{ id: 's7', label: '7"' }], addons: { x: { name: 'Extra cheese' } } });
  assert.match(h, /A-012/);
  assert.match(h, /2 × Margherita/);
  assert.match(h, /7&quot; · Extra cheese/);
  assert.match(h, /₹270/);
  assert.match(h, /−₹30/);
  assert.match(h, /Paid by UPI/);
  assert.match(h, /xxxxxx3210/);
  assert.doesNotMatch(h, /9876543210/);
  assert.match(h, /Vijay &lt;b&gt;/);
  assert.strictEqual(when(o.ts), '16/10/2026 00:11');
});
