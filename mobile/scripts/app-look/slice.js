// The Cheesy Pizza slice, drawn on a 1024 canvas centred on (512,512)
module.exports = (id = 's') => `
<defs>
  <linearGradient id="${id}ch" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFE27A"/><stop offset=".55" stop-color="#FFC93C"/><stop offset="1" stop-color="#F5A623"/>
  </linearGradient>
  <linearGradient id="${id}cr" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F4B55E"/><stop offset=".6" stop-color="#D9862F"/><stop offset="1" stop-color="#B8661F"/>
  </linearGradient>
  <radialGradient id="${id}pp" cx=".4" cy=".35" r=".7">
    <stop offset="0" stop-color="#F0603F"/><stop offset=".7" stop-color="#D2381F"/><stop offset="1" stop-color="#A82814"/>
  </radialGradient>
</defs>
<g transform="translate(14 28) rotate(-14 512 540)">
  <ellipse cx="512" cy="880" rx="200" ry="26" fill="#000" opacity=".18"/>
  <!-- cheese body -->
  <path d="M238 318 L786 318 L527 872 Q512 900 497 872 Z" fill="url(#${id}ch)"/>
  <!-- drips -->
  <path d="M279 380 L321 400 L311 515.0 a20.0 20.0 0 0 1 -40 0 Z" fill="url(#${id}ch)"/>
  <path d="M373 580 L415 600 L405 690.0 a20.0 20.0 0 0 1 -40 0 Z" fill="url(#${id}ch)"/>
  <path d="M755 360 L711 380 L721 519.0 a21.0 21.0 0 0 0 42 0 Z" fill="url(#${id}ch)"/>
  <path d="M671 540 L627 560 L637 659.0 a21.0 21.0 0 0 0 42 0 Z" fill="url(#${id}ch)"/>
  <!-- cheese shine -->
  <path d="M300 352 L520 352 L420 560 Z" fill="#fff" opacity=".18"/>
  <!-- pepperoni -->
  <g>
    <circle cx="410" cy="420" r="58" fill="url(#${id}pp)"/><circle cx="392" cy="402" r="9" fill="#8E1F0E" opacity=".55"/><circle cx="428" cy="440" r="7" fill="#8E1F0E" opacity=".55"/>
    <circle cx="618" cy="430" r="62" fill="url(#${id}pp)"/><circle cx="600" cy="414" r="9" fill="#8E1F0E" opacity=".55"/><circle cx="640" cy="448" r="8" fill="#8E1F0E" opacity=".55"/>
    <circle cx="512" cy="590" r="52" fill="url(#${id}pp)"/><circle cx="498" cy="578" r="8" fill="#8E1F0E" opacity=".55"/>
    <circle cx="520" cy="745" r="34" fill="url(#${id}pp)"/>
  </g>
  <!-- basil -->
  <path d="M590 540 q40 -46 92 -30 q-22 50 -92 30 z" fill="#3FA15A"/><path d="M590 540 q40 -18 92 -30" stroke="#2A7A40" stroke-width="5" fill="none"/>
  <path d="M440 668 q-46 -34 -90 -6 q34 42 90 6 z" fill="#3FA15A"/><path d="M440 668 q-46 -14 -90 -6" stroke="#2A7A40" stroke-width="5" fill="none"/>
  <!-- herbs -->
  <g fill="#5C7A2E"><circle cx="470" cy="480" r="5"/><circle cx="560" cy="510" r="5"/><circle cx="455" cy="540" r="4"/><circle cx="575" cy="660" r="4"/><circle cx="350" cy="370" r="4"/><circle cx="700" cy="370" r="5"/></g>
  <!-- crust -->
  <path d="M206 330 Q512 236 818 330 Q830 372 790 380 Q512 300 234 380 Q194 372 206 330 Z" fill="url(#${id}cr)"/>
  <path d="M250 322 Q512 262 774 322" stroke="#FFD99A" stroke-width="10" stroke-linecap="round" fill="none" opacity=".7"/>
  <g fill="#9A5418" opacity=".5"><circle cx="330" cy="330" r="5"/><circle cx="450" cy="310" r="5"/><circle cx="580" cy="310" r="5"/><circle cx="700" cy="330" r="5"/></g>
</g>`;
