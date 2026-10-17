// One eighth of a whole pizza, tip at the centre (512,512), crust at the top
module.exports = (id = 'w') => {
  const R = 470, a1 = -112.5 * Math.PI / 180, a2 = -67.5 * Math.PI / 180, gap = 7;
  const cx = 512, cy = 512 - gap; // pull the tip up a little so neighbouring slices show a cut line
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  const d = (r, b1, b2) => `M${cx} ${cy} L${p(r, b1)} A${r} ${r} 0 0 1 ${p(r, b2)} Z`;
  const s = 0.012; // trim the sides for the cut
  return `<defs>
  <radialGradient id="${id}ch" cx="512" cy="512" r="470" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE27A"/><stop offset=".7" stop-color="#FFC93C"/><stop offset="1" stop-color="#F5A623"/></radialGradient>
  <radialGradient id="${id}cr" cx="512" cy="512" r="470" gradientUnits="userSpaceOnUse"><stop offset=".86" stop-color="#F4B55E"/><stop offset=".94" stop-color="#D9862F"/><stop offset="1" stop-color="#B8661F"/></radialGradient>
  <radialGradient id="${id}pp" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#F0603F"/><stop offset=".7" stop-color="#D2381F"/><stop offset="1" stop-color="#A82814"/></radialGradient>
  </defs>
  <path d="${d(R, a1 + s, a2 - s)}" fill="url(#${id}cr)"/>
  <path d="${d(R - 44, a1 + s + .004, a2 - s - .004)}" fill="url(#${id}ch)"/>
  <circle cx="${cx - 18}" cy="${cy - 175}" r="40" fill="url(#${id}pp)"/><circle cx="${cx - 30}" cy="${cy - 185}" r="7" fill="#8E1F0E" opacity=".5"/>
  <circle cx="${cx + 22}" cy="${cy - 330}" r="46" fill="url(#${id}pp)"/><circle cx="${cx + 10}" cy="${cy - 342}" r="8" fill="#8E1F0E" opacity=".5"/>
  <path d="M${cx - 50} ${cy - 262} q30 -38 72 -26 q-18 40 -72 26 z" fill="#3FA15A"/>
  <g fill="#5C7A2E"><circle cx="${cx + 8}" cy="${cy - 110}" r="4"/><circle cx="${cx - 40}" cy="${cy - 300}" r="4"/><circle cx="${cx + 50}" cy="${cy - 240}" r="4"/><circle cx="${cx - 60}" cy="${cy - 380}" r="4"/></g>
  <path d="M${p(R - 14, a1 + .06)} A${R - 14} ${R - 14} 0 0 1 ${p(R - 14, a2 - .06)}" stroke="#FFD99A" stroke-width="7" stroke-linecap="round" fill="none" opacity=".7"/>`;
};
