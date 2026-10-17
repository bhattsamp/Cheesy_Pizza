// Backgrounds and icon layers built around the brand pin (logo.js)
const logo = require('./logo.js');
const TEAL = '#0E9CBA';
const bgFill = (admin, id) => admin
  ? `<defs><radialGradient id="${id}" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#3A3F44"/><stop offset="1" stop-color="#141618"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#${id})"/>`
  : `<defs><radialGradient id="${id}" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#1DB2CF"/><stop offset="1" stop-color="#086A80"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#${id})"/>`;
const rays = admin => `<g opacity="${admin ? .06 : .09}" fill="#fff">${Array.from({ length: 16 }, (_, i) => `<path d="M512 512 L${512 + 800 * Math.cos(i * Math.PI / 8 - 0.08)} ${512 + 800 * Math.sin(i * Math.PI / 8 - 0.08)} L${512 + 800 * Math.cos(i * Math.PI / 8 + 0.08)} ${512 + 800 * Math.sin(i * Math.PI / 8 + 0.08)} Z"/>`).join('')}</g>`;
const badge = `<g transform="translate(760 760)"><circle r="150" fill="#F2B632" stroke="#fff" stroke-width="22"/>
  <rect x="-62" y="-80" width="124" height="150" rx="14" fill="#141618"/>
  <rect x="-40" y="-52" width="80" height="12" rx="6" fill="#F2B632"/><rect x="-40" y="-24" width="80" height="12" rx="6" fill="#F2B632"/><rect x="-40" y="4" width="50" height="12" rx="6" fill="#F2B632"/>
  <path d="M-62 60 l20 20 l21 -20 l21 20 l21 -20 l21 20 l20 -20 v10 h-124z" fill="#141618"/></g>`;
const scaled = (inner, k, dy = 0) => `<g transform="translate(512 ${512 + dy}) scale(${k}) translate(-512 -512)">${inner}</g>`;
// Customer icon: teal pin on white. Admin icon: white pin on teal with a yellow bill badge.
const iconBg = admin => admin ? bgFill(false, 'ibg') : `<rect width="1024" height="1024" fill="#fff"/>`;
const iconPin = (admin, id) => admin ? logo({ pin: '#fff', ink: TEAL, id }) : logo({ pin: TEAL, ink: '#fff', id });
module.exports = {
  TEAL,
  screenBg: admin => bgFill(admin, admin ? 'sbg1' : 'sbg0') + rays(admin),
  icon: admin => iconBg(admin) + scaled(iconPin(admin, 'i' + +admin), .86, 18) + (admin ? badge : ''),
  iconBg,
  iconFg: admin => scaled(iconPin(admin, 'f' + +admin) + (admin ? badge : ''), .6, 10),
  whitePin: id => logo({ pin: '#fff', ink: TEAL, id }),
};
