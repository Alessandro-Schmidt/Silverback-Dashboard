// The Silverback loading overlay: the gorilla beats its chest while GitHub answers, turns to stare at 85 %,
// and overshoots to 112 % once the data is in. The progress is paced, not measured: it's one request.

// Head in profile (A) and turned toward the viewer (B): same curve commands, only the head points differ.
const A = [4,168,16,140,34,124, 46,114,54,104,58,92, 62,76,66,56,76,42, 80,36,86,30,92,28, 100,30,110,38,118,48, 124,54,130,58,136,60, 139,62,139,66,135,68, 133,69,131,70,131,72, 136,76,142,80,147,84, 152,88,152,95,147,98, 150,102,149,108,143,111, 138,118,130,121,122,121, 118,122,116,126,118,130, 134,134,150,144,162,158, 172,170,178,186,180,200];
const B = [4,168,16,140,34,124, 46,114,54,104,58,92, 60,76,62,56,70,42, 76,34,84,28,94,26, 104,27,114,33,120,42, 125,48,128,54,128,60, 129,63,128,66,126,68, 125,70,125,72,126,74, 128,78,130,82,131,86, 133,90,133,95,130,98, 132,102,131,107,127,110, 122,116,116,119,110,120, 108,122,110,126,116,130, 134,134,150,144,162,158, 172,170,178,186,180,200];
const MESSAGES = [
  "Beating chest at the GitHub API…", "Counting your merges. Twice.", "Judging your drafts silently…",
  "Asserting dominance over rate limits…", "Peeling the backlog like a banana…", "Out-reviewing your reviewers…", "Flexing on develop…",
];
const clamp = (v) => Math.max(0, Math.min(1, v));
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function gorilla(t) {
  const n = A.map((a, i) => a + (B[i] - a) * t);
  let d = "M 0 200";
  for (let i = 0; i < n.length; i += 6) d += " C " + n.slice(i, i + 6).map((v) => v.toFixed(2)).join(" ");
  const ey = 66.75 + 1.25 * t, e1x = 124.5 - 12.5 * t, e2x = 104 - 14 * t, s = 0.3 + 0.7 * clamp((t - 0.2) / 0.6);
  const line = (x, w) => `M ${(x - 5.5 * w).toFixed(2)} ${(ey - 0.75 * w).toFixed(2)} L ${(x + 5.5 * w).toFixed(2)} ${(ey + 0.75 * w).toFixed(2)}`;
  const r = -3.5 * clamp((t - 0.6) / 0.4);
  const brow = (x, up) => up
    ? `M ${(x - 6).toFixed(2)} ${(ey - 6 + r).toFixed(2)} Q ${x.toFixed(2)} ${(ey - 10.5 + r).toFixed(2)} ${(x + 6).toFixed(2)} ${(ey - 7 + r).toFixed(2)}`
    : `M ${(x - 6).toFixed(2)} ${(ey - 5.5).toFixed(2)} Q ${x.toFixed(2)} ${(ey - 6.5).toFixed(2)} ${(x + 6).toFixed(2)} ${(ey - 5).toFixed(2)}`;
  return { d: d + " Z", eye1: line(e1x, 1), eye2: line(e2x, s), e2o: clamp((t - 0.2) / 0.45), bo: clamp((t - 0.45) / 0.35), b1: brow(e1x, true), b2: brow(e2x, false) };
}

const el = document.getElementById("loader"), q = (sel) => el.querySelector(sel);

// Shows the overlay; returns finish(ok): ok runs the 112 % finale before hiding, a failure hides at once.
export function startLoading(label) {
  let pct = 0, msg = 0, t = 0, done = false, raf;
  const draw = () => {
    const g = gorilla(t);
    q(".g-body").setAttribute("d", g.d);
    q(".g-eye1").setAttribute("d", g.eye1);
    q(".g-eye2").setAttribute("d", g.eye2); q(".g-eye2").setAttribute("opacity", g.e2o);
    q(".g-b1").setAttribute("d", g.b1); q(".g-b2").setAttribute("d", g.b2);
    q(".g-b1").setAttribute("opacity", g.bo); q(".g-b2").setAttribute("opacity", g.bo);
    const looking = pct >= 85, over = pct >= 100;
    const text = over ? "Loaded 112%. We don’t stop at 100." : looking ? "Hm. Almost ready…" : MESSAGES[msg];
    const m = q(".sb-msg");
    if (m.textContent !== text) { m.textContent = text; m.style.animation = "none"; m.offsetWidth; m.style.animation = ""; }
    q(".ld-main").style.width = `${Math.min(pct, 100)}%`;
    q(".ld-over").style.width = `${Math.max(0, pct - 100)}%`;
    q("[role=progressbar]").setAttribute("aria-valuenow", Math.min(pct, 100));
    q(".ld-status").textContent = over ? "Overcommitted, as usual" : `Fetching ${label}`;
    q(".ld-pct").textContent = `${pct}%`;
  };
  const turn = (target) => { // ease the head toward or away from the viewer
    cancelAnimationFrame(raf);
    if (reduceMotion()) { t = target; return draw(); }
    const from = t, start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 720);
      t = from + (target - from) * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
      draw();
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  // Until the data is in, crawl toward 95 % and wait there; then run on to 112 %.
  const tick = setInterval(() => {
    const prev = pct;
    pct = done ? Math.min(112, Math.max(pct, 85) + 6) : Math.min(95, pct + (pct < 70 ? 4 + Math.round(Math.random() * 5) : 1));
    if (prev < 85 && pct >= 85) turn(1);
    draw();
  }, 220);
  const rot = setInterval(() => { msg = (msg + 1) % MESSAGES.length; draw(); }, 1600);
  const stop = () => { clearInterval(tick); clearInterval(rot); cancelAnimationFrame(raf); el.hidden = true; };
  turn(0), draw();
  el.hidden = false;
  return (ok) => new Promise((resolve) => {
    if (!ok) return stop(), resolve();
    done = true;
    const wait = setInterval(() => { if (pct >= 112) clearInterval(wait), setTimeout(() => (stop(), resolve()), 700); }, 100);
  });
}
