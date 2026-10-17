// Backgrounds and icon layers built around the brand pin (logo.js)
const logo = require('./logo.js');
const TEAL = '#0E9CBA', CREAM = '#FFF7E8';
// Customer: warm cream like the logo's own background. Admin: dark, to tell the two apps apart.
const bgFill = (admin, id) => admin
  ? `<defs><radialGradient id="${id}" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#3A3F44"/><stop offset="1" stop-color="#141618"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#${id})"/>`
  : `<defs><radialGradient id="${id}" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#FFFDF8"/><stop offset="1" stop-color="#FBE6C2"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#${id})"/>`;
const rays = admin => `<g opacity="${admin ? .06 : .07}" fill="${admin ? '#fff' : '#F5A316'}">${Array.from({ length: 16 }, (_, i) => `<path d="M512 512 L${512 + 800 * Math.cos(i * Math.PI / 8 - 0.08)} ${512 + 800 * Math.sin(i * Math.PI / 8 - 0.08)} L${512 + 800 * Math.cos(i * Math.PI / 8 + 0.08)} ${512 + 800 * Math.sin(i * Math.PI / 8 + 0.08)} Z"/>`).join('')}</g>`;
const badge = `<g transform="translate(770 780)"><circle r="140" fill="#F2B632" stroke="#fff" stroke-width="22"/>
  <rect x="-58" y="-76" width="116" height="140" rx="14" fill="#141618"/>
  <rect x="-38" y="-50" width="76" height="12" rx="6" fill="#F2B632"/><rect x="-38" y="-24" width="76" height="12" rx="6" fill="#F2B632"/><rect x="-38" y="2" width="48" height="12" rx="6" fill="#F2B632"/>
  <path d="M-58 56 l19 19 l20 -19 l20 19 l20 -19 l20 19 l19 -19 v10 h-116z" fill="#141618"/></g>`;
const scaled = (inner, k, dy = 0) => `<g transform="translate(512 ${512 + dy}) scale(${k}) translate(-512 -512)">${inner}</g>`;
// Both icons show the full pin with its dripping cheese: on white (customer) or dark with a bill badge (admin)
const iconBg = admin => admin ? bgFill(true, 'ibg') : `<rect width="1024" height="1024" fill="#fff"/>`;
module.exports = {
  TEAL, CREAM,
  screenBg: admin => bgFill(admin, admin ? 'sbg1' : 'sbg0') + rays(admin),
  icon: admin => iconBg(admin) + scaled(logo({ id: 'i' + +admin }), .9, 4) + (admin ? badge : ''),
  iconBg,
  iconFg: admin => scaled(logo({ id: 'f' + +admin }) + (admin ? badge : ''), .62, 4),
  pin: (id, part) => logo({ id, part }),
};
