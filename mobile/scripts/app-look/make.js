const slice = require('./slice.js');
const bg = admin => admin
  ? `<defs><radialGradient id="bg${admin?1:0}" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#3A3F44"/><stop offset="1" stop-color="#141618"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#bg${admin?1:0})"/>`
  : `<defs><radialGradient id="bg${admin?1:0}" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#2BB3C9"/><stop offset="1" stop-color="#0B5F6E"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#bg${admin?1:0})"/>`;
const rays = admin => `<g opacity="${admin ? .06 : .10}" fill="#fff">${Array.from({length:16},(_,i)=>`<path d="M512 512 L${512+800*Math.cos(i*Math.PI/8-0.08)} ${512+800*Math.sin(i*Math.PI/8-0.08)} L${512+800*Math.cos(i*Math.PI/8+0.08)} ${512+800*Math.sin(i*Math.PI/8+0.08)} Z"/>`).join('')}</g>`;
const badge = `<g transform="translate(730 730)"><circle r="150" fill="#F2B632" stroke="#0E1F24" stroke-width="22"/>
  <rect x="-62" y="-80" width="124" height="150" rx="14" fill="#0E1F24"/>
  <rect x="-40" y="-52" width="80" height="12" rx="6" fill="#F2B632"/><rect x="-40" y="-24" width="80" height="12" rx="6" fill="#F2B632"/><rect x="-40" y="4" width="50" height="12" rx="6" fill="#F2B632"/>
  <path d="M-62 60 l20 20 l21 -20 l21 20 l21 -20 l21 20 l20 -20 v10 h-124z" fill="#0E1F24"/></g>`;
// what: full | bg | fg ; admin flag ; scale of slice
module.exports = ({ what = 'full', admin = false, scale = 0.86 }) => {
  const s = `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${slice(admin ? 'a' : 'c')}</g>`;
  const inner = what === 'bg' ? bg(admin) + rays(admin) : what === 'fg' ? s + (admin ? `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${badge}</g>` : '') : bg(admin) + rays(admin) + s + (admin ? badge : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${inner}</svg>`;
};
