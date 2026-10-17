// Pieces of the teal loading screen: doodled teal background, a white brush-stroke circle,
// little slice icons (filled and outline), a cheese wave with toppings, and a cheese drop.
const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(7);
const f = n => n.toFixed(1);

// White line doodles of pizza things, faint on the teal
const doodle = [
  // slice
  `<path d="M-40 -34 Q0 -52 40 -34 L0 46 Z"/><path d="M-34 -24 Q0 -40 34 -24"/><circle cx="-8" cy="-10" r="7"/><circle cx="10" cy="8" r="6"/>`,
  // mushroom
  `<path d="M-38 0 Q-38 -38 0 -38 Q38 -38 38 0 Z"/><path d="M-14 0 L-16 34 Q0 40 16 34 L14 0"/><circle cx="-14" cy="-18" r="5"/><circle cx="14" cy="-20" r="4"/>`,
  // leaf
  `<path d="M-40 20 Q-30 -36 34 -30 Q30 30 -40 20 Z"/><path d="M-40 20 Q0 0 30 -26"/>`,
  // tomato slice
  `<circle r="36"/><circle r="26"/><path d="M0 -26 V26 M-26 0 H26"/><circle cx="-12" cy="-12" r="4"/><circle cx="12" cy="12" r="4"/>`,
  // cheese wedge
  `<path d="M-40 24 L40 24 L40 -10 L-40 -30 Z"/><path d="M-40 -30 L40 -10"/><circle cx="-12" cy="6" r="6"/><circle cx="18" cy="12" r="5"/>`,
  // pepper ring
  `<path d="M-30 -10 Q-34 -34 -6 -32 Q0 -40 8 -32 Q34 -34 30 -10 Q32 26 0 34 Q-32 26 -30 -10 Z"/><path d="M0 -34 Q4 -46 12 -50"/>`,
];
const bg = (w, h) => {
  let s = `<defs><radialGradient id="tbg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#16949F"/><stop offset=".6" stop-color="#0E7C88"/><stop offset="1" stop-color="#095C66"/></radialGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#tbg)"/><g fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".13">`;
  const cols = 5, rows = Math.round(cols * h / w);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + .5 + (rnd() - .5) * .5 + (r % 2) * .5) * w / cols, y = (r + .5 + (rnd() - .5) * .4) * h / rows;
    s += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rnd() * 360)}) scale(${f(1.1 + rnd() * .6)})">${doodle[(r * cols + c) % doodle.length]}</g>`;
  }
  return s + '</g>';
};

// A white circle with a rough, painted edge (1024 canvas)
const circle = () => {
  let s = `<circle cx="512" cy="512" r="418" fill="#fff"/><g fill="none" stroke="#fff" stroke-linecap="round">`;
  for (let i = 0; i < 90; i++) {
    const a0 = rnd() * Math.PI * 2, len = .15 + rnd() * .5, r = 418 + rnd() * 30 - 6, a1 = a0 + len;
    s += `<path d="M${f(512 + r * Math.cos(a0))} ${f(512 + r * Math.sin(a0))} A${f(r)} ${f(r)} 0 0 1 ${f(512 + r * Math.cos(a1))} ${f(512 + r * Math.sin(a1))}" stroke-width="${f(2 + rnd() * 12)}" opacity="${f(.55 + rnd() * .45)}"/>`;
  }
  // a few flicks off the edge, like a brush lifting
  for (let i = 0; i < 14; i++) {
    const a0 = rnd() * Math.PI * 2, r = 452 + rnd() * 16, a1 = a0 + .04 + rnd() * .12;
    s += `<path d="M${f(512 + r * Math.cos(a0))} ${f(512 + r * Math.sin(a0))} A${f(r)} ${f(r)} 0 0 1 ${f(512 + r * Math.cos(a1))} ${f(512 + r * Math.sin(a1))}" stroke-width="${f(2 + rnd() * 3)}" opacity=".8"/>`;
  }
  return s + '</g>';
};

// A small pizza slice icon (200 canvas): filled in colour, or a white outline waiting to fill
const slice = filled => filled
  ? `<defs><linearGradient id="sch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD84E"/><stop offset="1" stop-color="#F7B21E"/></linearGradient></defs>
  <path d="M34 54 Q100 18 166 54 L104 184 Q100 190 96 184 Z" fill="url(#sch)" stroke="#E08A1E" stroke-width="5" stroke-linejoin="round"/>
  <path d="M30 52 Q100 12 170 52 L162 70 Q100 36 38 70 Z" fill="#E59A42" stroke="#C9761E" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="78" cy="92" r="15" fill="#E2422C"/><circle cx="124" cy="96" r="14" fill="#E2422C"/><circle cx="102" cy="136" r="12" fill="#E2422C"/>
  <path d="M88 116 q10 -12 22 -6 q-8 12 -22 6z" fill="#3E9B3C"/><circle cx="74" cy="88" r="4" fill="#fff" opacity=".4"/><circle cx="120" cy="92" r="4" fill="#fff" opacity=".4"/>`
  : `<g fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" opacity=".9">
  <path d="M34 54 Q100 18 166 54 L100 186 Z"/><path d="M40 70 Q100 36 160 70"/><circle cx="80" cy="94" r="13"/><circle cx="122" cy="98" r="12"/><circle cx="100" cy="138" r="10"/></g>`;

// The cheese wave: two periods of a smooth wave across width W so it can slide sideways forever
const wave = (W, H, { amp, base, top, bottom, shine }) => {
  const P = W / 2, n = 64;
  let d = `M0 ${H} L0 ${f(base)}`;
  for (let i = 0; i <= n; i++) {
    const x = W * i / n, y = base + amp * Math.sin(x / P * Math.PI * 2) + amp * .35 * Math.sin(x / P * Math.PI * 4 + 1);
    d += ` L${f(x)} ${f(y)}`;
  }
  d += ` L${W} ${H} Z`;
  let s = `<defs><linearGradient id="wv${base}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><path d="${d}" fill="url(#wv${base})"/>`;
  if (shine) {
    // soft highlight following the crest
    let h = '';
    for (let i = 0; i <= n; i++) {
      const x = W * i / n, y = base + 16 + amp * Math.sin(x / P * Math.PI * 2) + amp * .35 * Math.sin(x / P * Math.PI * 4 + 1);
      h += `${i ? ' L' : 'M'}${f(x)} ${f(y)}`;
    }
    s += `<path d="${h}" stroke="#FFF1B0" stroke-width="10" fill="none" stroke-linecap="round" opacity=".55" stroke-dasharray="180 140"/>`;
  }
  return s;
};

// Toppings sitting in the cheese at the bottom corners (1080 wide)
const tomato = (x, y, r, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><circle r="${r}" fill="#D9351F"/><circle r="${r * .84}" fill="#F0553A"/>
  ${[0, 1, 2, 3, 4].map(i => { const a = i * 72 * Math.PI / 180; return `<ellipse cx="${f(Math.cos(a) * r * .5)}" cy="${f(Math.sin(a) * r * .5)}" rx="${f(r * .2)}" ry="${f(r * .12)}" transform="rotate(${i * 72} ${f(Math.cos(a) * r * .5)} ${f(Math.sin(a) * r * .5)})" fill="#FFB199"/>`; }).join('')}
  <circle r="${r * .16}" fill="#FFC2AE"/></g>`;
const leaf = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-60 0 Q0 -46 60 0 Q0 46 -60 0Z" fill="#3E9B3C"/><path d="M-52 0 Q0 -6 56 0" stroke="#2A6E28" stroke-width="5" fill="none"/></g>`;
const toppings = () => tomato(150, 390, 78, 10) + leaf(300, 440, 1, -20) + tomato(1000, 470, 70, 40) + leaf(860, 480, .8, 200);

// A cheese drop (200 canvas)
const drop = () => `<defs><linearGradient id="dch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE07A"/><stop offset="1" stop-color="#F6B21E"/></linearGradient></defs>
  <path d="M100 20 Q150 100 150 130 A50 50 0 1 1 50 130 Q50 100 100 20Z" fill="url(#dch)"/><ellipse cx="82" cy="128" rx="10" ry="16" fill="#FFF6D0" opacity=".8"/>`;

module.exports = { bg, circle, slice, wave, toppings, drop };
