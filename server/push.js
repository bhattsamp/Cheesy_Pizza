// Push alerts for the Cheesy Pizza Admin app: when a customer places an online order,
// every Admin app signed in at that outlet gets a notification that rings, even when
// the app is closed or the phone is locked. Sent through Firebase Cloud Messaging.
// Needs FIREBASE_SERVICE_ACCOUNT (the Firebase service account key, as JSON or base64);
// without it push alerts are off and everything else works as before.
const { PushToken } = require('./models');

let messaging = null;
function initPush(raw = process.env.FIREBASE_SERVICE_ACCOUNT) {
  if (!raw) return false;
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getMessaging } = require('firebase-admin/messaging');
  const key = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  messaging = getMessaging(initializeApp({ credential: cert(key) }, 'cheesy-push'));
  return true;
}
const pushEnabled = () => !!messaging;
const setMessaging = m => { messaging = m; }; // for tests

const saveToken = (token, outletId, staffId) =>
  PushToken.updateOne({ _id: token }, { $set: { outletId: String(outletId), staffId: String(staffId), ts: Date.now() } }, { upsert: true });

// The old token proves this phone was signed in; it may come back changed or with a new outlet
async function refreshToken(old, token, outletId) {
  const prev = await PushToken.findById(String(old)).lean();
  if (!prev || prev.role === 'customer') return false;
  if (old !== token) await PushToken.deleteOne({ _id: old });
  await saveToken(token, outletId || prev.outletId, prev.staffId);
  return true;
}
const removeToken = token => PushToken.deleteOne({ _id: String(token) });

function orderText(o) {
  const items = (o.items || []).map(l => `${l.qty}× ${l.name}`).join(', ');
  return [o.total != null ? '₹' + o.total : '', o.customer && o.customer.name, items].filter(Boolean).join(' · ');
}

// Sends one alert per new online order to the phones signed in at its outlet
async function notifyNewOrders(orders) {
  if (!messaging) return;
  for (const o of orders) {
    const tokens = (await PushToken.find({ outletId: String(o.outletId), role: { $ne: 'customer' } }).lean()).map(t => t._id);
    if (!tokens.length) continue;
    const r = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: `New online order ${o.no || ''}`.trim(), body: orderText(o) },
      data: { orderId: String(o.id) },
      android: {
        priority: 'high',
        notification: { channelId: 'orders', sound: 'order_ring', visibility: 'public', defaultVibrateTimings: true, tag: String(o.id) },
      },
    });
    // Forget phones that uninstalled the app or were reset
    const gone = r.responses.map((x, i) => !x.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(x.error && x.error.code) ? tokens[i] : null).filter(Boolean);
    if (gone.length) await PushToken.deleteMany({ _id: { $in: gone } });
  }
}

/* ----- customer app: new offers and order updates ----- */

// A customer phone signs up for offers, and for each order it places (no login needed)
async function saveCustomerToken(token, old, orders = []) {
  let keep = [];
  if (old && old !== token) {
    const prev = await PushToken.findById(String(old)).lean();
    if (prev && prev.role === 'customer') keep = prev.orders || [];
    await PushToken.deleteOne({ _id: String(old), role: 'customer' });
  }
  const ids = [...keep, ...orders].map(String).slice(-30);
  await PushToken.updateOne({ _id: String(token) },
    { $set: { role: 'customer', ts: Date.now() }, $push: { orders: { $each: ids, $slice: -30 } } }, { upsert: true });
}

const STATUS_TEXT = {
  preparing: () => ['Order accepted', 'We are making your pizza now.'],
  ready: o => o.type === 'delivery' ? ['Order packed', 'It leaves with the rider soon.'] : ['Ready to pick up', 'Your order is ready at the counter.'],
  out: o => ['Out for delivery', (o.rider && o.rider.name ? o.rider.name + ' is' : 'Your rider is') + ' on the way.'],
  done: o => o.type === 'delivery' ? ['Delivered', 'Enjoy your pizza!'] : ['Picked up', 'Enjoy your pizza!'],
  cancelled: () => ['Order cancelled', 'Your order was cancelled. Call the outlet if this is a surprise.'],
};

function offerText(of) {
  const off = of.pct ? of.pct + '% off' : of.kind === 'pct' ? of.value + '% off' : of.kind === 'flat' ? '₹' + of.value + ' off' : of.type === 'bogo' ? 'Buy 1 get 1 free' : '';
  const bits = [off, of.code ? 'use code ' + of.code : '', of.min ? 'on orders over ₹' + of.min : ''].filter(Boolean);
  return bits.length ? bits.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : 'Open the app to see it.';
}

// Sends one message to many phones, 500 at a time, and forgets dead ones
async function sendTo(tokens, msg) {
  for (let i = 0; i < tokens.length; i += 500) {
    const part = tokens.slice(i, i + 500);
    const r = await messaging.sendEachForMulticast({ ...msg, tokens: part });
    const gone = r.responses.map((x, j) => !x.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(x.error && x.error.code) ? part[j] : null).filter(Boolean);
    if (gone.length) await PushToken.deleteMany({ _id: { $in: gone } });
  }
}
const updateMsg = (title, body, data, tag) => ({
  notification: { title, body },
  data,
  android: { priority: 'high', notification: { channelId: 'updates', visibility: 'public', defaultSound: true, defaultVibrateTimings: true, tag } },
});

// Tells the phones that placed each order where it has got to
async function notifyOrderUpdates(orders) {
  if (!messaging) return;
  for (const o of orders) {
    const t = STATUS_TEXT[o.status];
    if (!t) continue;
    const tokens = (await PushToken.find({ role: 'customer', orders: String(o.id) }).lean()).map(x => x._id);
    if (!tokens.length) continue;
    const [title, body] = t(o);
    await sendTo(tokens, updateMsg(`${title}${o.no ? ' · ' + o.no : ''}`, body, { orderId: String(o.id) }, 'order-' + o.id));
  }
}

// Tells every customer phone about offers that just went live
async function notifyNewOffers(offers) {
  if (!messaging || !offers.length) return;
  const tokens = (await PushToken.find({ role: 'customer' }).lean()).map(x => x._id);
  if (!tokens.length) return;
  for (const of of offers) await sendTo(tokens, updateMsg('New offer: ' + (of.name || 'a treat for you'), offerText(of), { offer: String(of.id) }, 'offer-' + of.id));
}

module.exports = { initPush, setMessaging, pushEnabled, saveToken, refreshToken, removeToken, notifyNewOrders, orderText,
  saveCustomerToken, notifyOrderUpdates, notifyNewOffers, offerText, STATUS_TEXT };
