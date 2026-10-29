// The Silverback rate crest (design board "Badge"): shield in the tier colours, gorilla in a dark circle,
// a star per tier, a crown for the top tier, and a ribbon with the tier name from 80 px up.
// Shared by the web app and the extension popup.
import { tier, TIERS } from "./stats.js";

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

// A crest `size` px wide, as a button that opens the explainer card (see explainer()); `still` gives the bare SVG.
// Empty string when there is no rate yet (nothing merged).
export function crest(rate, size, still = false) {
  const svg = crestSvg(rate, size);
  return !svg || still ? svg : `<button type="button" class="crest-btn" data-explain aria-label="Silverback rate ${rate}%: ${tier(rate).name}. What is this?" title="What is the Silverback rate?">${svg}</button>`;
}

function crestSvg(rate, size) {
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

// The card a crest opens: what the Silverback rate is and the four tiers. Put it in a <dialog> once per page.
export const explainer = () => `
  <h2 style="margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em">The Silverback rate</h2>
  <p>The share of merged pull requests that were <b>approved on the first review</b>: no reviewer asked for changes
    before the first approval. Higher means your PRs land clean, without a round of rework.</p>
  <p>It's computed for the period you pick, for you (your PRs merged into <code>develop</code>), for the repository
    (every author) and for the whole organization. With nothing merged there is no rate yet.</p>
  <ul class="tier-list">${TIERS.map((t) => `<li>${crestSvg(t.min === 90 ? 95 : t.min + 1, 34)}<span><b style="color:${t.c}">${t.name}</b>
    <span class="muted">${t.min === 90 ? "90–100%" : `${t.min}–${t.min + 29}%`}</span></span></li>`).join("")}</ul>
  <form method="dialog"><button class="explain-close">Got it</button></form>`;

// Silverback rate over time (one point per day, week or month from rateSeries), on faint tier bands.
export function rateChart(series, title, sub) {
  // Drawn at ~600 px wide (its usual size: half the page) so the labels keep their real size.
  const W = 600, L = 44, R = W - 12, n = series.length, x = (i) => (n > 1 ? L + (i * (R - L)) / (n - 1) : (L + R) / 2), y = (v) => 140 - v * 1.2;
  const known = series.map((b, i) => ({ ...b, i })).filter((b) => b.rate != null);
  const fmt = (b) => new Date(b.start).toLocaleDateString("en-GB", b.unit === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
  const every = Math.max(1, Math.ceil(n / 8));
  const bands = [[0, 30, "#F85149"], [30, 60, "#E3B341"], [60, 90, "#56D364"], [90, 100, "#F5C84C"]];
  const last = known.at(-1);
  return `<figure class="card ratechart"><figcaption><div style="font-weight:600">${title}</div><div class="sub" style="margin-top:2px">${sub}</div></figcaption>
    <svg viewBox="0 0 ${W} 166" width="100%" role="img" style="display:block;overflow:visible;max-height:220px" aria-label="${title}: ${known.map((b) => `${fmt(b)} ${b.rate}%`).join(", ") || "no merged PRs in this period"}">
      ${bands.map(([a, b, c]) => `<rect x="${L}" y="${y(b)}" width="${R - L}" height="${(b - a) * 1.2}" fill="${c}" opacity=".07"/>`).join("")}
      <g stroke="#21262D">${[30, 60, 90].map((v) => `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
      <line x1="${L}" x2="${R}" y1="140" y2="140" stroke="#30363D"/>
      <g fill="#9AA4B2" font-size="11" font-family="Inter, sans-serif" text-anchor="end">${[0, 30, 60, 90].map((v) => `<text x="${L - 8}" y="${y(v) + 4}">${v}%</text>`).join("")}</g>
      <g fill="#9AA4B2" font-size="11" font-family="Inter, sans-serif" text-anchor="middle">${series.map((b, i) => (i % every && i !== n - 1) ? "" : `<text x="${x(i)}" y="158">${fmt(b)}</text>`).join("")}</g>
      ${known.length > 1 ? `<polyline points="${known.map((b) => `${x(b.i)},${y(b.rate)}`).join(" ")}" fill="none" stroke="#4C8DFF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
      <g stroke="#161B22" stroke-width="2">${known.map((b) => `<circle cx="${x(b.i)}" cy="${y(b.rate)}" r="4.5" fill="${tier(b.rate).c}" tabindex="0" data-tip="${fmt(b)}: ${b.rate}% · ${tier(b.rate).name} (${b.first} of ${b.total})" aria-label="${fmt(b)}: ${b.rate}%, ${b.first} of ${b.total}"/>`).join("")}</g>
      ${known.length ? "" : `<text x="${(L + R) / 2}" y="85" text-anchor="middle" fill="#9AA4B2" font-size="12" font-family="Inter, sans-serif">No merged PRs in this period</text>`}
    </svg>${last ? `<div class="sub" style="margin-top:0">Latest: <b style="color:${tier(last.rate).c}">${last.rate}%</b> · ${tier(last.rate).name}</div>` : ""}</figure>`;
}

// The light gorilla disc (logo) as inline SVG; the squint eye only from 40 px, as the brand asks.
export function mark(size, cls = "") {
  const id = `mark${++ids}`;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 200 200" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="100" cy="100" r="96"/></clipPath></defs>
    <circle cx="100" cy="100" r="96" fill="#E6EDF3"/><path clip-path="url(#${id})" fill="#0D1117" d="${GORILLA}"/>
    ${size >= 40 ? `<path d="M119 66 L130 67.5" stroke="#E6EDF3" stroke-width="2.6" stroke-linecap="round"/>` : ""}</svg>`;
}
