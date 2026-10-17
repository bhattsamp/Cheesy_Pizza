// The Cheesy Pizza brand mark, redrawn from the logo: a map pin with "CHEESY PIZZA" written
// round a white disc with a "C". 1024 canvas. pin = pin colour, ink = letters and disc.
// The text uses Dosis (fonts/), so pages that draw it need fontFaces() in their CSS.
const fs = require('fs'), path = require('path');
const fontFaces = () => ['Dosis', 'Courgette'].map(f => `@font-face{font-family:'${f}';font-weight:100 900;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f + '.woff2')).toString('base64')}) format('woff2')}`).join('');
const logo = ({ pin = '#0E9CBA', ink = '#FFFFFF', id = 'l' } = {}) => {
  const cx = 512, cy = 380, R = 290, tip = 968;
  const a = 38 * Math.PI / 180;
  const lx = cx - R * Math.cos(a), rx = cx + R * Math.cos(a), sy = cy + R * Math.sin(a);
  const f = n => n.toFixed(1);
  // round head, then sides that curve in to a long, narrow, rounded tip
  const pinPath = `M${f(lx)} ${f(sy)} A${R} ${R} 0 1 1 ${f(rx)} ${f(sy)}` +
    ` C${f(cx + 185)} ${f(cy + 330)} ${f(cx + 34)} ${f(tip - 160)} ${f(cx + 22)} ${f(tip - 26)}` +
    ` Q${cx} ${tip + 6} ${f(cx - 22)} ${f(tip - 26)}` +
    ` C${f(cx - 34)} ${f(tip - 160)} ${f(cx - 185)} ${f(cy + 330)} ${f(lx)} ${f(sy)} Z`;
  const rt = 186, rb = 236;
  const font = `font-family="Dosis" font-weight="700" font-size="76" letter-spacing="5"`;
  return `<defs>
  <path id="${id}top" d="M${cx - rt} ${cy} A${rt} ${rt} 0 0 1 ${cx + rt} ${cy}"/>
  <path id="${id}bot" d="M${cx - rb} ${cy} A${rb} ${rb} 0 0 0 ${cx + rb} ${cy}"/>
  </defs>
  <path d="${pinPath}" fill="${pin}"/>
  <text ${font} fill="${ink}"><textPath href="#${id}top" startOffset="50%" text-anchor="middle">CHEESY PIZZA</textPath></text>
  <text ${font} fill="${ink}"><textPath href="#${id}bot" startOffset="50%" text-anchor="middle">CHEESY PIZZA</textPath></text>
  <text x="${cx - 212}" y="${cy + 24}" font-family="Dosis" font-weight="700" font-size="56" fill="${ink}" text-anchor="middle">*</text>
  <text x="${cx + 212}" y="${cy + 24}" font-family="Dosis" font-weight="700" font-size="56" fill="${ink}" text-anchor="middle">*</text>
  <circle cx="${cx}" cy="${cy}" r="96" fill="${ink}"/>
  <text x="${cx}" y="${cy + 40}" font-family="Dosis" font-weight="800" font-size="118" fill="${pin}" text-anchor="middle">C</text>`;
};
module.exports = logo;
module.exports.fontFaces = fontFaces;
