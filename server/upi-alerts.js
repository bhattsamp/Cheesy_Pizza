// UPI payment alerts: the Admin app on a shop phone reads the "Received ₹450 from RIPAL PATEL"
// notification of the shop's UPI app (PhonePe Business, Paytm for Business, GPay for Business...)
// and posts its words here. The server reads amount, name and UPI reference from them, saves the
// alert, and marks a saved-but-unpaid order paid when exactly one has that amount. Free: no
// payment gateway; the money still goes straight to the shop's UPI account.
const crypto = require('crypto');

const APPS = {
  'com.phonepe.app.business': 'PhonePe Business', 'com.phonepe.app': 'PhonePe',
  'com.paytm.business': 'Paytm for Business', 'net.one97.paytm': 'Paytm',
  'com.google.android.apps.nbu.paisa.merchant': 'GPay for Business', 'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.bharatpe.app': 'BharatPe', 'in.amazon.mShop.android.shopping': 'Amazon Pay',
  'in.org.npci.upiapp': 'BHIM', 'com.google.android.apps.messaging': 'Messages (bank SMS)',
};

// Words of one notification -> {amt, name, vpa, ref} or null when it isn't money coming in
function parseAlert(title, text) {
  const t = (String(title || '') + ' \n ' + String(text || '')).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const incoming = /\b(received|credited|paid you|sent you|has paid|got)\b/i.test(t);
  const outgoing = /\b(debited|you paid|paid to|sent to|request(ed)?|failed|declined|refund(ed)?|reminder|cashback|offer)\b/i.test(t);
  if (!incoming || (outgoing && !/\b(received|credited)\b/i.test(t))) return null;
  const m = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(t);
  if (!m) return null;
  const amt = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) / 100;
  if (!(amt > 0) || amt > 500000) return null;
  const nm = /\b(?:from|by)\s+([A-Za-z][A-Za-z .'&-]{1,40}?)(?=\s*(?:\bon\b|\bvia\b|\bto\b|\bin\b|\bfor\b|[.,|:(·•\u2022\-–]|\bupi\b|\bref\b|\s-\s|\d|$))/i.exec(t)
    || /^([A-Za-z][A-Za-z .'&-]{1,40}?)\s+(?:has\s+)?(?:paid|sent)\s+you/i.exec(t);
  const name = nm ? nm[1].trim().replace(/\s+/g, ' ') : '';
  const vpa = (/([\w.\-]{2,}@[a-z][a-z0-9]{1,15})\b/i.exec(t) || [])[1] || '';
  const ref = (/\b(\d{12})\b/.exec(t) || [])[1] || '';
  const bad = !name || (vpa && vpa.toLowerCase().startsWith(name.toLowerCase())) || /^(vpa|a\/c|ac|upi|your|bank)$/i.test(name);
  return { amt, name: bad ? '' : name, vpa, ref };
}

const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const due = o => Math.round(((+o.total || 0) - (+o.walletUsed || 0)) * 100) / 100;

function routes(app, store, M) {
  // The owner or a manager turns alerts on for one outlet; the phone keeps the key it gets back
  app.post('/api/upi-alerts/key', async (req, res) => {
    const { staffId, pin, outletId } = req.body || {};
    const s = staffId && await M.Staff.findById(String(staffId)).lean();
    if (!s || !['owner', 'oowner', 'manager'].includes(s.role) || !(await store.checkStaffPin(staffId, pin))) return res.status(403).json({ error: 'Only the owner or a manager can turn this on' });
    if (!(await M.Outlet.findById(String(outletId)).lean())) return res.status(400).json({ error: 'Unknown outlet' });
    const key = 'cpu_' + crypto.randomBytes(18).toString('hex');
    const keys = await store.getSetting('upiKeys', {});
    keys[hash(key)] = { outletId: String(outletId), by: s.name || '', ts: Date.now() };
    await store.setSetting('upiKeys', keys);
    res.json({ key });
  });

  app.post('/api/upi-alerts', async (req, res) => {
    const b = req.body || {};
    const k = (await store.getSetting('upiKeys', {}))[hash(b.key || '')];
    if (!k) return res.status(403).json({ error: 'This phone is not set up for UPI alerts' });
    const title = String(b.title || '').slice(0, 300), text = String(b.text || '').slice(0, 600), pkg = String(b.pkg || '').slice(0, 120);
    const p = parseAlert(title, text);
    if (!p) return res.json({ ok: true, ignored: true });
    const ts = Math.min(Date.now(), +b.ts || Date.now());
    // The same payment can be announced twice (an alert updated, or the bank SMS too)
    const id = 'ua_' + hash(p.ref ? 'ref:' + p.ref : [k.outletId, pkg, p.amt, text, Math.floor(ts / 120000)].join('|')).slice(0, 20);
    if (await M.UpiAlert.findById(id).lean()) return res.json({ ok: true, duplicate: true, id });
    const alert = { id, outletId: k.outletId, ts, amt: p.amt, name: p.name, vpa: p.vpa, ref: p.ref, app: pkg === 'test' ? 'Test from the Admin app' : APPS[pkg] || pkg, test: pkg === 'test' || undefined, text: (title + ' · ' + text).slice(0, 400), status: 'new', orderId: '', orderNo: '' };
    // Unpaid orders saved in the last 8 hours at this outlet, waiting for exactly this amount
    const linked = new Set((await M.UpiAlert.find({ outletId: k.outletId, orderId: { $ne: '' } }, { orderId: 1 }).lean()).map(a => a.orderId));
    const open = (await store.readCollection('orders', { outletId: k.outletId, ts: { $gt: ts - 8 * 3600e3 } }))
      .filter(o => !o.paid && o.status !== 'cancelled' && o.pay && o.pay.mode === 'pending' && !linked.has(o.id));
    const same = pkg === 'test' ? [] : open.filter(o => Math.abs(due(o) - p.amt) < 0.01);
    const changes = { upsert: { upialerts: [alert] } };
    if (same.length === 1) {
      const o = same[0];
      o.pay = { mode: 'upi', given: 0, change: 0, ...(p.ref ? { utr: p.ref } : {}) };
      o.paid = true; o.paidAt = Date.now(); o.paidBy = 'UPI alert'; o.upiAlert = id;
      Object.assign(alert, { status: 'matched', orderId: o.id, orderNo: o.no, by: 'auto' });
      changes.upsert.orders = [o];
    } else alert.candidates = same.map(o => o.id);
    const r = await store.applyChanges(changes);
    if ((r.conflicts || []).length) { // an order changed at that moment: keep the alert for the till to match
      Object.assign(alert, { status: 'new', orderId: '', orderNo: '', by: '' });
      await store.applyChanges({ upsert: { upialerts: [alert] } });
    }
    res.json({ ok: true, id, status: alert.status, orderNo: alert.orderNo });
  });
}

module.exports = { routes, parseAlert, APPS };
