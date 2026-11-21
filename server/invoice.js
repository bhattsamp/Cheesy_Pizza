// A customer's invoice as a web page, opened from the WhatsApp "View Invoice" link (/b/<order id>).
// Layout follows a standard Indian restaurant tax invoice; GST lines appear only when the outlet
// has a GSTIN and GST rate set. Menu prices include GST, so the tax is worked out of the total.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = ts => new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
const PAY = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', wallet: 'Cheesy Wallet', zomato: 'Zomato', due: 'On account' };
const TYPES = { delivery: 'Delivery', takeaway: 'Pick Up', dine: 'Dine In' };
const money = n => (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
const rs = n => '₹' + money(n);
const rs2 = n => '₹' + (Math.round(n * 100) / 100).toFixed(2); // totals and payments always show paise, e.g. ₹1155.00

function invoicePage(o, outlet, { sizes = [], addons = {} } = {}) {
  outlet = outlet || {};
  const size = id => (sizes.find(s => s.id === id) || { label: id + '"' }).label;
  const items = o.items || [];
  // A merged table's bill: items grouped under the table they were ordered on (the order's own table first)
  const own = 'T' + (o.table || '?');
  const merged = items.some(l => l.from);
  const order = merged ? [own, ...new Set(items.filter(l => l.from).map(l => l.from))] : [null];
  let n = 0;
  const rows = order.map(g => {
    const its = g === null ? items : items.filter(l => (l.from || own) === g);
    if (!its.length) return '';
    const head = g === null ? '' : `<tr class="grp"><td colspan="4">${esc(g)}</td><td class="r">${money(its.reduce((a, l) => a + l.unit * l.qty, 0))}</td></tr>`;
    return head + its.map(l => row(l, n++)).join('');
  }).join('');
  function row(l, i) {
    const extra = l.combo ? (l.picks || []).join(', ') : [l.size ? size(l.size) : '', ...(l.addons || []).map(a => (addons[a] && addons[a].name) || a)].filter(Boolean).join(', ');
    return `<tr><td>${i + 1}.</td><td class="n">${esc(l.name)}${extra ? `<div class="x">${esc(extra)}</div>` : ''}</td><td class="c">${esc(l.qty)}</td><td class="r">${money(l.unit)}</td><td class="r">${money(l.unit * l.qty)}</td></tr>`;
  }
  const qty = items.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const disc = (o.discounts || []).filter(d => d.amt);
  const total = Number(o.total) || 0;
  // GST as saved on the order when it was billed (older orders: the outlet's current setting).
  // 'incl': prices include GST, so taxable value = total / (1 + rate). 'excl': GST was added on top.
  const g = o.gst || (outlet.gstin && Number(outlet.gstRate) > 0 ? { rate: Number(outlet.gstRate), mode: outlet.gstMode === 'excl' ? 'excl' : 'incl' } : null);
  const rate = g ? g.rate : 0;
  const r2 = n => Math.round(n * 100) / 100;
  const taxable = !rate ? null : g.mode === 'excl' && g.net != null ? r2(g.net) : g.mode === 'excl' ? r2(total - (g.tax != null ? g.tax : total - total / (1 + rate / 100))) : r2(total / (1 + rate / 100));
  const half = rate ? r2((g.mode === 'excl' && g.tax != null ? g.tax : total - taxable) / 2) : 0;
  const roundOff = rate ? r2(total - taxable - 2 * half) : 0;
  const itemTotal = o.subtotal != null ? o.subtotal : items.reduce((a, l) => a + l.unit * l.qty, 0);
  const sums = [
    ['Quantity', qty],
    ...(disc.length ? [['Item Total', rs(itemTotal)], ...disc.map(d => [d.name, '−' + rs(d.amt)])] : []),
    ...(rate ? [['Sub Total', rs(taxable)], [`SGST (${rate / 2}%)`, rs(half)], [`CGST (${rate / 2}%)`, rs(half)], ...(roundOff ? [['Round off Amount:', (roundOff > 0 ? '₹+' : '₹') + money(roundOff)]] : [])] : [['Sub Total', rs(total)]]),
  ].map(([k, v]) => `<div class="s"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
  // One "Payment mode" line per way of paying, as on a standard tax invoice, then what is still not paid
  const splits = o.pay && o.pay.mode === 'split' && Array.isArray(o.pay.splits) ? o.pay.splits : null;
  const wallet = Number(o.walletUsed) || 0;
  const parts = splits ? splits.filter(x => Number(x.amt) > 0 && x.mode !== 'due').map(x => [x.mode, Number(x.amt)]) : o.paid && o.pay && !['due', 'pending'].includes(o.pay.mode) ? [[o.pay.mode, total - (o.pay.mode === 'wallet' ? 0 : wallet)]] : [];
  if (wallet && !(o.pay && o.pay.mode === 'wallet')) parts.unshift(['wallet', wallet]);
  const left = Math.max(0, Math.round((total - parts.reduce((a, [, v]) => a + v, 0)) * 100) / 100);
  const utr = o.pay && o.pay.utr ? ' · UPI ref ' + o.pay.utr : '';
  const line = (k, v) => `<div class="s pm"><span>${esc(k)}</span><span>${v}</span></div>`;
  const pay = o.status === 'cancelled' ? '<div class="pm">Order cancelled</div>'
    : parts.map(([m, v]) => line(`Payment mode (Paid via ${PAY[m] || m}${m === 'upi' ? utr : ''})`, rs2(v))).join('') + (left || !parts.length ? line('Payment mode (Not Paid)', rs2(left)) : '');
  const shop = outlet.legal || 'CHEESY PIZZA';
  const token = String(o.no || '').replace(/^\D+/, '').replace(/^0+(?=\d)/, '');
  const cell = (k, v) => `<div class="g"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;
  const ids = [outlet.fssai ? 'FSSAI: ' + esc(outlet.fssai) : '', outlet.gstin ? 'GSTIN: ' + esc(outlet.gstin) : ''].filter(Boolean).join('<br>');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${esc(o.no)} · ${esc(shop)}</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/img/fonts/blogger-sans.css">
<style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#1f2a37;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}.w{max-width:560px;margin:0 auto;padding:18px 14px 28px}
.hd{text-align:center;margin:0 0 18px;padding-bottom:14px;border-bottom:2px dashed #e5e7eb}.lg{display:block;width:150px;height:auto;margin:-14px auto -18px}
h1,.tt,.bsb{font-family:var(--head,system-ui,sans-serif);font-weight:700}h1{font-size:18px;text-align:center;margin:4px 0 2px;letter-spacing:.3px;text-transform:uppercase;color:#0f4a55}.on{font-weight:800;font-size:17px;color:#e09a12;margin-top:4px}
.oa{margin:6px auto 0;max-width:420px;color:#374151;font-size:14px;line-height:1.45}.op a{color:#1a93a8;text-decoration:none;font-weight:600}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}.g{border-left:3px solid #e5e7eb;padding:2px 0 2px 12px}
.k{color:#6b7280;font-size:14px}.v{margin-top:2px;font-size:15px}.cu{margin:16px 0}.cu .v{text-transform:uppercase}.cu .p{text-transform:none}
.box{border:1px solid #e5e7eb;border-radius:12px;padding:16px 14px}.ad{text-align:center;font-weight:600;line-height:1.5}.tt{text-align:center;font-weight:700;margin:18px 0 10px}
table{width:100%;border-collapse:collapse;font-size:14px}th{font-weight:500;text-align:left;padding:8px 4px;border-top:2px solid #e5e7eb;border-bottom:2px solid #e5e7eb}td{padding:9px 4px;border-bottom:1px solid #f0f1f3;vertical-align:top}
.n{font-weight:600}.grp td{font-weight:800;color:#0f4a55;background:#f3f8f9;border-bottom:1px solid #e5e7eb}.x{font-weight:400;color:#6b7280;font-size:12px}.c{text-align:center}.r{text-align:right;white-space:nowrap}th.c{text-align:center}th.r{text-align:right}
.sums{border-top:2px solid #e5e7eb;margin-top:2px;padding-top:6px}.s{display:flex;justify-content:space-between;padding:5px 0;font-weight:600}.tot{border-top:2px solid #e5e7eb;margin-top:6px;padding-top:8px}
.pm{font-weight:600;padding:5px 0}.gi{margin-top:12px}.op{text-align:center;font-size:14px;margin-top:2px}.ids{text-align:center;color:#374151;margin-top:8px;font-size:14px;line-height:1.6}.ft{text-align:center;color:#6b7280;font-size:13px;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px}</style></head>
<body><div class="w"><header class="hd"><img class="lg" src="/img/logo-badge.png" alt="Cheesy Pizza" width="150" height="150">
<h1>${esc(shop)}</h1></header>
<div class="grid">${cell('Order Number', o.no || '')}${cell('Date', when(o.ts))}${cell('Order amount', rs(total))}${cell('Order type', TYPES[o.type] || '')}${cell('Biller Name', o.source === 'online' ? 'Online order' : (o.by || 'Counter'))}${cell('Token No.', token || '-')}${o.type === 'dine' && o.table ? cell('Table No.', o.table) : ''}${o.type === 'dine' && Number(o.guests) > 0 ? cell('No. of Persons', Number(o.guests)) : ''}</div>
<div class="cu"><div class="k">Customer Details</div>${o.customer && o.customer.name ? `<div class="v">${esc(o.customer.name)}</div>` : ''}${o.customer && o.customer.phone ? `<div class="v p">${esc(o.customer.phone)}</div>` : ''}${o.address ? `<div class="v p">${esc(o.address)}</div>` : ''}</div>
<div class="box">${outlet.name ? `<div class="ad">${esc(outlet.name)}</div>` : ''}${outlet.area ? `<div class="ad">${esc(outlet.area)}</div>` : ''}${outlet.phone ? `<div class="op">Ph: <a href="tel:${esc(String(outlet.phone).replace(/\s/g, ''))}">${esc(outlet.phone)}</a></div>` : ''}
${outlet.gstin || outlet.fssai ? `<div class="ad gi">${outlet.gstin ? `GSTIN : ${esc(outlet.gstin)}` : ''}${outlet.gstin && outlet.fssai ? '<br>' : ''}${outlet.fssai ? `FSSAI : ${esc(outlet.fssai)}` : ''}</div>` : ''}
<div class="tt">${rate ? 'TAX INVOICE' : 'INVOICE'}</div>
<table><thead><tr><th>No.</th><th>Name</th><th class="c">Qty.</th><th class="r">Rate(₹)</th><th class="r">Price(₹)</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sums">${sums}<div class="s tot"><span>Total Payable Amount:</span><span>${rs2(total)}</span></div>${pay}</div>
${ids ? `<div class="ids">${ids}</div>` : ''}</div>
<div class="ft">Pure veg · We don't use mayonnaise in any product.<br>Thank You &amp; Visit Again...!!!</div></div></body></html>`;
}

module.exports = { invoicePage, when };
