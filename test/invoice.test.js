const test = require('node:test');
const assert = require('node:assert');
const { invoicePage, when } = require('../server/invoice');

const o = { id: 'ord1', no: 'A-004', ts: Date.UTC(2026, 9, 15, 18, 41), type: 'takeaway', by: 'Jay', customer: { name: 'Vijay <b>', phone: '9725604468' },
  items: [{ qty: 1, name: 'Puff Garlic Strip', unit: 150, size: 's7', addons: ['x'] }, { qty: 1, name: 'Carry Bag', unit: 11, addons: [] }], subtotal: 161, total: 161, paid: true, pay: { mode: 'upi' } };
const opts = { sizes: [{ id: 's7', label: '7"' }], addons: { x: { name: 'Extra cheese' } } };

test('invoice with GST works the tax out of the total', () => {
  const h = invoicePage(o, { name: 'Main', legal: 'Cheesy Foods Pvt Ltd', area: 'Nadiad', phone: '9898905689', gstin: '24AAAAA0000A1Z5', gstRate: 5, fssai: '107240' }, opts);
  assert.match(h, /CHEESY FOODS|Cheesy Foods Pvt Ltd/);
  assert.match(h, /TAX INVOICE/);
  assert.match(h, /Sub Total<\/span><span>₹153.33/);
  assert.match(h, /SGST \(2.5%\)<\/span><span>₹3.83/);
  assert.match(h, /CGST \(2.5%\)<\/span><span>₹3.83/);
  assert.match(h, /Round off Amount:<\/span><span>₹\+0.01/);
  assert.match(h, /Total Payable Amount:<\/span><span>₹161/);
  assert.match(h, /Paid via UPI/);
  assert.match(h, /Token No.<\/div><div class="v">4/);
  assert.match(h, /Vijay &lt;b&gt;/);
  assert.match(h, /FSSAI: 107240/);
  assert.strictEqual(when(o.ts), '16/10/26 00:11');
});

test('invoice without GSTIN shows no tax lines', () => {
  const h = invoicePage(o, { name: 'Main', area: 'Nadiad' }, opts);
  assert.match(h, />INVOICE</);
  assert.doesNotMatch(h, /SGST|TAX INVOICE|GSTIN/);
  assert.match(h, /7&quot;, Extra cheese/);
});
