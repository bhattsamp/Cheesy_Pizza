// The Cheesy Pizza brand mark: a teal map pin holding a cheesy pizza ring round a "C",
// with melted cheese dripping off the bottom of the ring. 1024 canvas.
// part: 'all' (the whole mark), 'body' (no drips), 'drips' (only the drips) or 'drop' (one falling drop),
// so the loading screen can let the cheese drip slowly. Letters use Fredoka (fonts/): pages need fontFaces().
const fs = require('fs'), path = require('path');
const fontFaces = () => ['Fredoka', 'Courgette', 'Dosis'].map(f => `@font-face{font-family:'${f}';font-weight:100 900;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f + '.woff2')).toString('base64')}) format('woff2')}`).join('');
const cx = 512, cy = 392, R = 300, tip = 958;
const RO = 226, RI = 118, RT = 172; // cheese ring outer / inner radius, topping circle
const f = n => n.toFixed(1);
// x offset from the centre, length, width
const DRIPS = [[-120, 84, 44], [-48, 156, 50], [26, 64, 40], [100, 124, 46]];
const DRIP_TOP = cy + 190; // where the drips hang from (pivot for the drip animation), in the 1024 canvas
const drip = ([dx, len, w]) => {
  const x = cx + dx, y0 = cy + Math.sqrt(RO * RO - dx * dx) - 10, y1 = y0 + len, r = w / 2, n = r * .78;
  // flares out of the ring, narrows a little, then swells into a round blob at the end
  return `<path d="M${f(x - r - 14)} ${f(y0 - 12)} C${f(x - r - 2)} ${f(y0 - 8)} ${f(x - n)} ${f(y0 + 10)} ${f(x - n)} ${f(y0 + 34)}` +
    ` L${f(x - n)} ${f(y1 - r)} C${f(x - n)} ${f(y1 - r * .4)} ${f(x - r - 4)} ${f(y1 - r * .2)} ${f(x - r - 4)} ${f(y1 + 2)}` +
    ` A${r + 4} ${r + 4} 0 0 0 ${f(x + r + 4)} ${f(y1 + 2)} C${f(x + r + 4)} ${f(y1 - r * .2)} ${f(x + n)} ${f(y1 - r * .4)} ${f(x + n)} ${f(y1 - r)}` +
    ` L${f(x + n)} ${f(y0 + 34)} C${f(x + n)} ${f(y0 + 10)} ${f(x + r + 2)} ${f(y0 - 8)} ${f(x + r + 14)} ${f(y0 - 12)} Z"/>`;
};
const dripShine = ([dx, len, w]) => {
  const x = cx + dx, y0 = cy + Math.sqrt(RO * RO - dx * dx) - 10;
  return `<rect x="${f(x - w * .39 + 6)}" y="${f(y0 + 22)}" width="6" height="${f(Math.max(len - 34, 6))}" rx="3"/><circle cx="${f(x - w / 4)}" cy="${f(y0 + len + 4)}" r="5.5"/>`;
};
const pepperoni = (x, y, id) => `<g transform="translate(${f(x)} ${f(y)})"><circle r="27" fill="url(#${id}-pep)"/><circle r="27" fill="none" stroke="#A8231A" stroke-width="3"/>
  <circle cx="-9" cy="-6" r="3.4" fill="#9E2016" opacity=".7"/><circle cx="8" cy="5" r="3" fill="#9E2016" opacity=".7"/><circle cx="2" cy="-12" r="2.4" fill="#9E2016" opacity=".7"/><ellipse cx="-8" cy="-11" rx="8" ry="4" fill="#fff" opacity=".35" transform="rotate(-30 -8 -11)"/></g>`;
const basil = (x, y, rot) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})"><path d="M-22 0 Q0 -16 22 0 Q0 16 -22 0Z" fill="#3E9B3C"/><path d="M-18 0 Q0 -3 20 0" stroke="#2A6E28" stroke-width="2.4" fill="none"/><path d="M-14 -4 Q0 -14 16 -3" stroke="#7CCB68" stroke-width="2" fill="none" opacity=".7"/></g>`;
const toppings = id => {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const a = (-75 + i * 30) * Math.PI / 180, x = cx + RT * Math.cos(a), y = cy + RT * Math.sin(a);
    s += i % 2 ? basil(x, y, i * 30 + 105) : pepperoni(x, y, id);
  }
  // herb flecks scattered over the cheese
  for (let i = 0; i < 26; i++) {
    const a = (i * 137.5) * Math.PI / 180, r = RI + 18 + ((i * 53) % (RO - RI - 36));
    s += `<circle cx="${f(cx + r * Math.cos(a))}" cy="${f(cy + r * Math.sin(a))}" r="${2.6 + (i % 3)}" fill="#5B6B1E" opacity=".75"/>`;
  }
  return s;
};
const pinPath = (() => {
  const a = 40 * Math.PI / 180, lx = cx - R * Math.cos(a), rx = cx + R * Math.cos(a), sy = cy + R * Math.sin(a);
  return `M${f(lx)} ${f(sy)} A${R} ${R} 0 1 1 ${f(rx)} ${f(sy)}` +
    ` C${f(cx + 170)} ${f(cy + 360)} ${f(cx + 52)} ${f(tip - 130)} ${f(cx + 30)} ${f(tip - 30)}` +
    ` Q${cx} ${tip + 12} ${f(cx - 30)} ${f(tip - 30)}` +
    ` C${f(cx - 52)} ${f(tip - 130)} ${f(cx - 170)} ${f(cy + 360)} ${f(lx)} ${f(sy)} Z`;
})();
const defs = id => `<defs>
  <linearGradient id="${id}-pin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2CBBCB"/><stop offset=".55" stop-color="#1497A9"/><stop offset="1" stop-color="#0B7383"/></linearGradient>
  <linearGradient id="${id}-dish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A7686"/><stop offset="1" stop-color="#0E8A9B"/></linearGradient>
  <radialGradient id="${id}-disc" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#25B3C4"/><stop offset="1" stop-color="#0D8597"/></radialGradient>
  <linearGradient id="${id}-cheese" gradientUnits="userSpaceOnUse" x1="0" y1="${cy - RO}" x2="0" y2="${cy + RO + 160}"><stop offset="0" stop-color="#FFE48A"/><stop offset=".55" stop-color="#FFD24F"/><stop offset="1" stop-color="#F6B524"/></linearGradient>
  <radialGradient id="${id}-pep" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#F0533B"/><stop offset="1" stop-color="#C92D1E"/></radialGradient>
  <filter id="${id}-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#06424C" flood-opacity=".35"/></filter>
  </defs>`;
const body = id => `
  <ellipse cx="${cx}" cy="${tip + 14}" rx="70" ry="12" fill="#06424C" opacity=".18"/>
  <path d="${pinPath}" fill="url(#${id}-pin)" stroke="#087080" stroke-width="10"/>
  <path d="M${cx - 236} ${cy - 40} A250 250 0 0 1 ${cx + 60} ${cy - 246}" stroke="#fff" stroke-width="16" stroke-linecap="round" fill="none" opacity=".28"/>
  <circle cx="${cx}" cy="${cy}" r="${RO + 22}" fill="url(#${id}-dish)"/>
  <g filter="url(#${id}-sh)">
    <path d="M${cx - RO} ${cy} A${RO} ${RO} 0 1 0 ${cx + RO} ${cy} A${RO} ${RO} 0 1 0 ${cx - RO} ${cy} Z M${cx - RI} ${cy} A${RI} ${RI} 0 1 1 ${cx + RI} ${cy} A${RI} ${RI} 0 1 1 ${cx - RI} ${cy} Z" fill="url(#${id}-cheese)" fill-rule="evenodd"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${RO - 5}" fill="none" stroke="#FFF2BE" stroke-width="7" opacity=".9"/>
  <circle cx="${cx}" cy="${cy}" r="${RI + 4}" fill="none" stroke="#FFF2BE" stroke-width="7"/>
  ${toppings(id)}
  <circle cx="${cx}" cy="${cy}" r="${RI - 4}" fill="url(#${id}-disc)"/>
  <text x="${cx}" y="${cy + 64}" font-family="Fredoka" font-weight="700" font-size="190" fill="#06606E" opacity=".35" text-anchor="middle">C</text>
  <text x="${cx}" y="${cy + 58}" font-family="Fredoka" font-weight="700" font-size="190" fill="#fff" text-anchor="middle">C</text>`;
const drips = id => `<g fill="url(#${id}-cheese)">${DRIPS.map(drip).join('')}</g><g fill="#FFF6D0" opacity=".75">${DRIPS.map(dripShine).join('')}</g>`;
// One drop that falls off the end of the longest drip
const drop = id => {
  const [dx, len] = DRIPS[1], x = cx + dx, y = cy + Math.sqrt(RO * RO - dx * dx) - 10 + len + 40;
  return `<path d="M${x} ${y - 26} Q${x + 18} ${y} ${x + 18} ${y + 10} A18 18 0 1 1 ${x - 18} ${y + 10} Q${x - 18} ${y} ${x} ${y - 26}Z" fill="url(#${id}-cheese)"/><circle cx="${x - 6}" cy="${y + 8}" r="4" fill="#FFF6D0"/>`;
};
const logo = ({ id = 'l', part = 'all' } = {}) => defs(id) + (
  part === 'body' ? body(id) : part === 'drips' ? drips(id) : part === 'drop' ? drop(id) : body(id) + drips(id));
module.exports = logo;
module.exports.fontFaces = fontFaces;
module.exports.DRIP_TOP = DRIP_TOP;
