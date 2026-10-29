// The Silverback rate crest (design board "Badge"): shield in the tier colours, gorilla in a dark circle,
// a star per tier, a crown for the top tier, and a ribbon with the tier name from 80 px up.
// Shared by the web app and the extension popup.
import { tier } from "./stats.js";

export const GORILLA = "M 0 200 C 4 168 16 140 34 124 C 46 114 54 104 58 92 C 62 76 66 56 76 42 C 80 36 86 30 92 28 C 100 30 110 38 118 48 C 124 54 130 58 136 60 C 139 62 139 66 135 68 C 133 69 131 70 131 72 C 136 76 142 80 147 84 C 152 88 152 95 147 98 C 150 102 149 108 143 111 C 138 118 130 121 122 121 C 118 122 116 126 118 130 C 134 134 150 144 162 158 C 172 170 178 186 180 200 Z";
export const SHIELD = "M60 4 L110 18 V60 C110 96 88 122 60 134 C32 122 10 96 10 60 V18 Z";

let ids = 0;
function stars(n) {
  let d = "";
  for (let k = 0; k < n; k++) {
    const x = 60 + (k - (n - 1) / 2) * 14;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2.25 : 5;
      d += `${i ? "L" : "M"}${(x + r * Math.cos(a)).toFixed(1)} ${(26 + r * Math.sin(a)).toFixed(1)} `;
    }
    d += "Z ";
  }
  return d;
}

// SVG markup for a crest `size` px wide; empty string when there is no rate yet (nothing merged).
export function crest(rate, size) {
  const t = tier(rate);
  if (!t) return "";
  const id = `crest${++ids}`, upper = t.name.toUpperCase(), ribbon = size >= 80;
  return `<svg class="crest" viewBox="0 -14 120 154" width="${size}" height="${Math.round((size * 154) / 120)}" role="img" aria-label="Silverback rate ${rate}%: ${t.name}">
    <path d="${SHIELD}" fill="${t.d}"/>
    <path d="M60 12 L102 24 V60 C102 91 83 113 60 124 C37 113 18 91 18 60 V24 Z" fill="${t.c}"/>
    ${t.stars ? `<path d="${stars(t.stars)}" fill="#0D1117"/>` : ""}
    <defs><clipPath id="${id}"><circle cx="60" cy="68" r="30"/></clipPath></defs>
    <circle cx="60" cy="68" r="30" fill="#0D1117"/>
    <g clip-path="url(#${id})"><g transform="translate(30 38) scale(0.3)">
      <path fill="${t.c}" d="${GORILLA}"/><path d="M119 66 L130 67.5" stroke="#0D1117" stroke-width="5" stroke-linecap="round"/></g></g>
    ${t.stars === 3 ? `<path transform="translate(46 -12) scale(1.15)" d="M0 14 L2 2 L8 8 L12 0 L16 8 L22 2 L24 14 Z" fill="${t.c}" stroke="#0D1117" stroke-width="1.5" stroke-linejoin="round"/>` : ""}
    ${ribbon ? `<path d="M4 104 L22 100 L22 120 L4 124 L10 112 Z" fill="${t.d}"/><path d="M116 104 L98 100 L98 120 L116 124 L110 112 Z" fill="${t.d}"/>
      <rect x="18" y="98" width="84" height="20" rx="2" fill="#0D1117" stroke="${t.c}" stroke-width="2"/>
      <text x="60" y="111.5" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="${upper.length > 12 ? 6.6 : 9}" fill="${t.c}" letter-spacing="0.4">${upper}</text>` : ""}
  </svg>`;
}

// The light gorilla disc (logo) as inline SVG; the squint eye only from 40 px, as the brand asks.
export function mark(size, cls = "") {
  const id = `mark${++ids}`;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 200 200" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="100" cy="100" r="96"/></clipPath></defs>
    <circle cx="100" cy="100" r="96" fill="#E6EDF3"/><path clip-path="url(#${id})" fill="#0D1117" d="${GORILLA}"/>
    ${size >= 40 ? `<path d="M119 66 L130 67.5" stroke="#E6EDF3" stroke-width="2.6" stroke-linecap="round"/>` : ""}</svg>`;
}
