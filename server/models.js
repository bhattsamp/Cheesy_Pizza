// MongoDB collections for Cheesy Pizza (Mongoose models).
// Each document's _id is the app's own key (menu item id, customer phone, ...).
// Schemas list the fields the app looks up by; `strict: false` keeps every
// other field the app saves (prices, riders, wallet history, order lines, ...).
const mongoose = require('mongoose');
const { Schema } = mongoose;

const opts = { strict: false, minimize: false, versionKey: false };
const doc = (fields = {}, extra = {}) => new Schema({ _id: String, _pos: Number, ...fields }, { ...opts, ...extra });

const orderSchema = doc({ id: String, outletId: String, date: String, status: String, ts: Number });
orderSchema.index({ outletId: 1, date: 1 });
orderSchema.index({ 'customer.phone': 1 });
orderSchema.index({ status: 1 });

const models = {
  // Lookup lists shown in the app
  Category: mongoose.model('Category', doc({ label: String, labelGu: String }), 'categories'),
  OrderType: mongoose.model('OrderType', doc({ label: String }), 'order_types'),
  PaymentMode: mongoose.model('PaymentMode', doc({ label: String, color: String }), 'payment_modes'),
  Setting: mongoose.model('Setting', new Schema({ _id: String, value: Schema.Types.Mixed }, opts), 'settings'),
  Counter: mongoose.model('Counter', new Schema({ _id: String, n: Number }, opts), 'counters'),
  Image: mongoose.model('Image', new Schema({ _id: String, type: String, data: Buffer, ts: Number }, { versionKey: false }), 'images'), // uploaded menu photos

  // App data
  Size: mongoose.model('Size', doc({ id: String }), 'sizes'),
  Outlet: mongoose.model('Outlet', doc({ id: String, code: String }), 'outlets'),           // riders: [{name, phone}], alert: {tone, vol, loop}, alertSound
  MenuItem: mongoose.model('MenuItem', doc({ id: String, cat: String }), 'menu_items'),     // prices: {size: price}
  Addon: mongoose.model('Addon', doc(), 'addons'),                                          // prices: {size: price}
  Offer: mongoose.model('Offer', doc({ id: String, type: String }), 'offers'),
  Combo: mongoose.model('Combo', doc({ id: String }), 'combos'),
  ExtraMenu: mongoose.model('ExtraMenu', doc({ id: String }), 'extra_menus'),               // items: [{name, prices: {size: price}}]
  Staff: mongoose.model('Staff', doc({ id: String, pinHash: String }), 'staff'),
  Customer: mongoose.model('Customer', doc({ phone: String, pinHash: String }), 'customers'), // tx, myCodes
  Order: mongoose.model('Order', orderSchema, 'orders'),                                   // items, customer, pay, times
};

module.exports = models;
