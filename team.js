// Team view (design board "Team"), open to everyone: the repo's and org's Silverback rate,
// team totals, merged over the period, review balance, things that need attention, and a sortable members table.
import { crest, rateChart } from "./extension/lib/crest.js";
import { fetchTeam, periodLabel, pointLabel, tick, tier } from "./extension/lib/stats.js";

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const cache = new Map(); // `${repo}|${period}` → team stats, for the session
let team = null, sort = { key: "rate", dir: -1 }, q = "", host, stats;

export async function loadTeam(token, s) {
  const key = `${s.repo}|${s.period}`;
  team = cache.get(key) || cache.set(key, await fetchTeam(token, s.repo, s.org, s.period)).get(key);
  if (host && location.hash === "#team") draw();
}

export function renderTeam(el, s) {
  host = el, stats = s;
  team = cache.get(`${s.repo}|${s.period}`) || null;
  if (!team) { el.innerHTML = `<div class="sk" style="height:60px;width:320px"></div><div class="rankrow"><div class="sk" style="height:220px"></div><div class="sk" style="height:220px"></div></div><div class="rankrow"><div class="sk" style="height:220px"></div><div class="sk" style="height:220px"></div></div><div class="team-stats">${'<div class="sk" style="height:120px"></div>'.repeat(5)}</div><div class="sk" style="height:420px"></div>`; return; }
  draw();
}

const rateCell = (rate) => rate == null ? `<span class="mono muted">—</span>`
  : `${crest(rate, 26)}<span class="mono" style="font-size:14px;font-weight:600;color:${tier(rate).c}">${rate}%</span>`;
const avatar = (m, size = 36) => m.avatar ? `<img class="av" src="${esc(m.avatar)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`
  : `<span class="av" style="width:${size}px;height:${size}px;font-size:${size / 2.8}px;background:#4C8DFF">${esc(m.login.slice(0, 2).toUpperCase())}</span>`;

// A Silverback rate card with a big crest (shared with the My stats page).
export const rankCard = (label, r) => `<div class="card rankcard">${crest(r.rate, 84) || `<span style="width:84px"></span>`}<div>
    <div class="label" style="font-size:14px">${label}</div>
    ${r.rate == null ? `<div class="mono muted" style="font-size:40px;font-weight:600">—</div><div class="sub" style="margin-top:0">nothing merged yet</div>`
      : `<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:12px"><span class="mono" style="font-size:44px;font-weight:600;line-height:1.15;color:${tier(r.rate).c}">${r.rate}%</span><span style="font-size:16px;font-weight:700;color:${tier(r.rate).c}">${tier(r.rate).name}</span></div>
        <div class="sub" style="margin-top:2px">${r.first} of ${r.total} merged PRs approved on the first review</div>`}</div></div>`;

function draw() {
  const t = team, s = stats, repoName = esc(s.repo.split("/")[1]), org = esc(s.org);
  // Each rate gets half a line, with its chart over the chosen period beside it.
  const rankRow = (label, r, series, who) => `<div class="rankrow">${rankCard(label, r)}${rateChart(series, `${label} over time`, `${who}, ${periodLabel(t.period, t.at)}`)}</div>`;
  const stat = (label, value, sub) => `<div class="card" style="padding:20px 22px"><div class="label" style="font-size:14px">${label}</div><div class="mono" style="font-size:38px;font-weight:600;line-height:1.2;margin-top:4px">${value}</div><div class="sub" style="margin-top:4px">${sub}</div></div>`;

  // Team merges over the chosen period (one bar per day, week or month).
  const pts = t.series, wmax = Math.max(1, ...pts.map((b) => b.merged)), unit = pts[0]?.unit || "week";
  const weeksChart = `<figure class="card teamcard"><figcaption><div style="font-weight:600">Team merged PRs per ${unit}</div><div class="sub" style="margin-top:2px">All members, merged to develop, ${periodLabel(t.period, t.at)}</div></figcaption>
    <div class="bars" style="height:270px" aria-label="Team merged PRs per ${unit}: ${pts.map((b) => `${pointLabel(b)} ${b.merged}`).join(", ")}">${pts.map((b) => `<div class="bar" tabindex="0" aria-label="${pointLabel(b)}: ${b.merged} PRs merged">
      ${pts.length <= 12 ? `<span class="mono" style="font-size:12px;margin-bottom:4px">${b.merged}</span>` : ""}<div style="width:70%;max-width:36px;height:${(b.merged / wmax) * 240}px;background:var(--accent);border-radius:4px 4px 0 0"></div>
      <div class="tip"><div class="muted">${pointLabel(b)}</div><div>${b.merged} PRs merged</div></div></div>`).join("")}</div>
    <div class="xlabels">${pts.map((b, i) => `<span>${(pts.length - 1 - i) % Math.max(1, Math.ceil(pts.length / 7)) ? "" : tick(b)}</span>`).join("")}</div></figure>`;

  const bal = [...t.rows].sort((a, b) => b.merged - a.merged), bmax = Math.max(1, ...bal.map((m) => Math.max(m.merged, m.reviews)));
  const balance = `<figure class="card teamcard"><figcaption><div style="font-weight:600">Review balance</div><div class="sub" style="margin-top:2px">PRs merged vs. reviews given, per member</div></figcaption>
    <div class="legend"><span><i class="swatch" style="background:var(--accent)"></i>Merged</span><span><i class="swatch" style="background:var(--redo)"></i>Reviews given</span></div>
    <div class="scroll" style="display:flex;flex-direction:column;gap:12px">${bal.map((m) => `<div class="hrow" tabindex="0" aria-label="${esc(m.login)}: ${m.merged} merged, ${m.reviews} reviews given">
      ${avatar(m, 28)}<div style="flex:1 1 auto;display:flex;flex-direction:column;gap:3px">
        <div style="width:${(m.merged / bmax) * 100}%;height:10px;background:var(--accent);border-radius:0 4px 4px 0"></div>
        <div style="width:${(m.reviews / bmax) * 100}%;height:10px;background:var(--redo);border-radius:0 4px 4px 0"></div></div>
      <span class="mono" style="width:52px;text-align:right;font-size:11px;color:#B1BAC4">${m.merged} / ${m.reviews}</span>
      <div class="tip"><div>${esc(m.login)}</div><div class="muted">${m.merged} merged · ${m.reviews} reviews given</div></div></div>`).join("") || `<p class="muted">Nobody merged or reviewed in this period.</p>`}</div></figure>`;

  const warn = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E3B341" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:1px"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`;
  const attention = `<section class="card teamcard"><h2 style="font-size:15px;font-weight:600">Needs attention</h2>
    <div class="scroll" style="display:flex;flex-direction:column;gap:12px">${t.alerts.map((a) => `<div class="alert">${warn}<div><div style="font-weight:600;font-size:13px">${esc(a.title)}</div><div class="sub" style="margin-top:2px">${esc(a.detail)}</div></div></div>`).join("") || `<p class="muted" style="margin:0">Nothing stands out. The troop is in order.</p>`}</div></section>`;

  const ql = q.trim().toLowerCase();
  const rows = t.rows.filter((m) => !ql || m.login.toLowerCase().includes(ql)).sort((a, b) => {
    const x = a[sort.key] ?? -1, y = b[sort.key] ?? -1;
    return (typeof x === "string" ? x.localeCompare(y) : x - y) * sort.dir;
  });
  const cols = [["login", "Member"], ["merged", "Merged"], ["open", "Open"], ["rate", "Silverback"], ["cycle", "Cycle time"], ["reviews", "Reviews"], [null, "Over the period"]];
  const spark = (w) => {
    const mx = Math.max(...w, 1), y = (v) => (24 - (v / mx) * 20).toFixed(1), x = (i) => (w.length > 1 ? 4 + (i * 92) / (w.length - 1) : 96).toFixed(1);
    return `<svg width="100" height="28" viewBox="0 0 100 28" role="img" aria-label="Merged over the period: ${w.join(", ")}"><polyline points="${w.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="#4C8DFF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="96" cy="${y(w.at(-1))}" r="3" fill="#4C8DFF"/></svg>`;
  };
  const table = `<section class="card" style="padding:0;overflow:hidden">
    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)">
      <h2 class="section-title">Members <span class="muted" style="font-weight:500">${rows.length}</span></h2>
      <div style="display:flex;align-items:center;gap:8px"><label for="member-search" class="muted" style="font-size:13px">Find</label><input id="member-search" type="search" placeholder="GitHub handle" value="${esc(q)}" autocomplete="off"></div></div>
    <div style="overflow-x:auto"><div role="table" aria-label="Member performance">
      <div role="row" class="members headrow">${cols.map(([key, label]) => `<div role="columnheader" aria-sort="${key === sort.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}">${key
        ? `<button type="button" class="sortbtn${key === sort.key ? " on" : ""}" data-sort="${key}">${label} ${key === sort.key ? (sort.dir === 1 ? "↑" : "↓") : ""}</button>` : `<span class="sortbtn" style="cursor:default">${label}</span>`}</div>`).join("")}</div>
      ${rows.map((m) => `<div role="row" class="members">
        <div role="cell" style="display:flex;align-items:center;gap:12px;min-width:0">${avatar(m)}<div style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <a href="https://github.com/${esc(m.login)}" target="_blank" rel="noopener" style="font-weight:600">${esc(m.login)}</a>
          ${m.owner ? `<span class="owner-chip">Owner</span>` : ""}${m.login === s.me ? `<span class="owner-chip you-chip">You</span>` : ""}</div></div>
        <div role="cell" class="mono" style="font-size:15px;font-weight:600">${m.merged}</div>
        <div role="cell" class="mono">${m.open}</div>
        <div role="cell" style="display:flex;align-items:center;gap:8px" title="${m.rate == null ? "No merged PRs" : tier(m.rate).name}">${rateCell(m.rate)}</div>
        <div role="cell" class="mono">${m.cycle == null ? "—" : `${m.cycle.toFixed(1)} d`}</div>
        <div role="cell" class="mono">${m.reviews}</div>
        <div role="cell">${spark(m.trend)}</div></div>`).join("")}
      ${rows.length ? "" : `<div style="padding:28px 20px;text-align:center" class="muted">No member matches that handle.</div>`}
    </div></div></section>`;

  host.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px">
      <div><h1 style="font-size:26px;font-weight:700;letter-spacing:-.01em">Team performance</h1>
        <p class="muted" style="margin:4px 0 0">${org} · ${repoName} · ${t.rows.length} active member${t.rows.length === 1 ? "" : "s"} ${periodLabel(t.period, t.at)}</p></div>
      </div>
    ${rankRow(`Silverback rate · ${repoName}`, t.rate, t.series, "Every author's PRs merged into develop")}
    ${rankRow(`Silverback rate · ${org}`, s.orgRate, s.orgSeries, "PRs merged across the organization")}
    <section class="team-stats" aria-label="Team stats">
      ${stat("Merged PRs", t.merged, "all members, into develop")}
      ${stat("Median cycle time", t.cycle == null ? "—" : `${t.cycle.toFixed(1)} d`, "opened → merged")}
      ${stat("Open PRs", t.open, `on ${repoName}`)}
      ${stat("Reviews given", t.reviews, "approvals, comments, change requests")}
      ${stat("Active members", t.rows.length, "merged, reviewed or opened")}
    </section>
    <div class="team-charts">${balance}${weeksChart}${attention}</div>
    ${table}`;
}

// Sorting and search re-draw without refetching.
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-sort]");
  if (!b || !team) return;
  const key = b.dataset.sort;
  sort = { key, dir: sort.key === key ? -sort.dir : key === "login" || key === "cycle" ? 1 : -1 };
  draw();
  host.querySelector(`[data-sort="${key}"]`)?.focus();
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "member-search") return;
  q = e.target.value;
  draw();
  const input = host.querySelector("#member-search");
  input.focus(), input.setSelectionRange(q.length, q.length);
});
