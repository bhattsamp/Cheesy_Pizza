// A customer's invoice as a small web page, opened from the WhatsApp "View Invoice" link (/b/<order id>)
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = ts => new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
const PAY = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', wallet: 'Cheesy Wallet', zomato: 'Zomato', due: 'On account' };
const TYPES = { delivery: 'Delivery', takeaway: 'Takeaway', dine: 'Dine-in' };

function invoicePage(o, outlet, { sizes = [], addons = {} } = {}) {
  const size = id => (sizes.find(s => s.id === id) || { label: id + '"' }).label;
  const lines = (o.items || []).map(l => {
    const extra = l.combo ? (l.picks || []).join(' · ') : [l.size ? size(l.size) : '', ...(l.addons || []).map(a => (addons[a] && addons[a].name) || a)].filter(Boolean).join(' · ');
    return `<tr><td>${esc(l.qty)} × ${esc(l.name)}${extra ? `<div class="m">${esc(extra)}</div>` : ''}</td><td class="r">₹${esc(l.unit * l.qty)}</td></tr>`;
  }).join('');
  const disc = (o.discounts || []).map(d => `<tr><td>${esc(d.name)}</td><td class="r">−₹${esc(d.amt)}</td></tr>`).join('');
  const paid = o.paid ? `Paid by ${esc(PAY[o.pay && o.pay.mode] || 'cash')}` : 'To pay';
  const phone = String((o.customer && o.customer.phone) || '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${esc(o.no)} · Cheesy Pizza</title><meta name="robots" content="noindex">
<style>body{margin:0;background:#f3f7f8;color:#0f2e36;font:15px/1.45 system-ui,sans-serif}.c{max-width:440px;margin:16px auto;background:#fff;border-radius:16px;padding:20px 18px;box-shadow:0 2px 10px #0001}
h1{margin:0;font-size:24px;text-align:center}.s{text-align:center;color:#5b7178;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:7px 0;border-bottom:1px dashed #d5e0e3;vertical-align:top}
.r{text-align:right;white-space:nowrap;padding-left:10px}.m{color:#5b7178;font-size:12px}.t td{font-weight:800;font-size:18px;border:0}.k{display:flex;justify-content:space-between;font-size:13px;color:#5b7178;margin-top:10px}
.b{display:inline-block;margin-top:12px;padding:4px 10px;border-radius:999px;background:${o.paid ? '#dff3e6;color:#1b6b3a' : '#fdeccf;color:#8a5a00'};font-weight:700;font-size:13px}.f{text-align:center;margin-top:16px;color:#5b7178;font-size:13px}</style></head>
<body><div class="c"><h1>Cheesy Pizza</h1><div class="s">${esc(outlet ? outlet.name : '')}${outlet && outlet.area ? ' · ' + esc(outlet.area) : ''}${outlet && outlet.phone ? '<br>Ph ' + esc(outlet.phone) : ''}</div>
<div class="k"><span>Bill <b>${esc(o.no)}</b> · ${esc(TYPES[o.type] || '')}</span><span>${esc(when(o.ts))}</span></div>
<div class="k"><span>${esc((o.customer && o.customer.name) || 'Customer')}</span><span>${phone.length >= 10 ? 'xxxxxx' + esc(phone.slice(-4)) : ''}</span></div>
<table>${lines}${o.subtotal != null && disc ? `<tr><td>Item total</td><td class="r">₹${esc(o.subtotal)}</td></tr>` : ''}${disc}<tr class="t"><td>Total</td><td class="r">₹${esc(o.total)}</td></tr></table>
<span class="b">${o.status === 'cancelled' ? 'Cancelled' : paid}</span>
<div class="f">Thank you! Visit again 🍕<br>Pure veg · No mayonnaise products</div></div></body></html>`;
}

module.exports = { invoicePage, when };
