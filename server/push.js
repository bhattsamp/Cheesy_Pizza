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
  if (!prev) return false;
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
    const tokens = (await PushToken.find({ outletId: String(o.outletId) }).lean()).map(t => t._id);
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

module.exports = { initPush, setMessaging, pushEnabled, saveToken, refreshToken, removeToken, notifyNewOrders, orderText };
