const test = require('node:test');
const assert = require('node:assert');
const { offerText, STATUS_TEXT } = require('../server/push');

test('offer alerts say what the offer gives', () => {
  assert.equal(offerText({ type: 'day', pct: 20 }), '20% off.');
  assert.equal(offerText({ type: 'code', code: 'CHEESY50', kind: 'flat', value: 50, min: 399 }), '₹50 off, use code CHEESY50, on orders over ₹399.');
  assert.equal(offerText({ type: 'bogo' }), 'Buy 1 get 1 free.');
  assert.equal(offerText({}), 'Open the app to see it.');
});

test('order updates read right for delivery and pickup', () => {
  assert.deepEqual(STATUS_TEXT.done({ type: 'delivery' }), ['🎉 Order delivered', 'Enjoy your pizza! Thanks for ordering from Cheesy Pizza.']);
  assert.deepEqual(STATUS_TEXT.ready({ type: 'takeaway' })[0], '🍕 Ready for pickup!');
  assert.equal(STATUS_TEXT.out({ rider: { name: 'Ravi' } })[1], 'Ravi is on the way with your order. Tap to track it live.');
  assert.equal(STATUS_TEXT.placed, undefined);
});
