import { Preferences } from "@capacitor/preferences";
import { fetchStats, listOrgs, listRepos, setStatus, tenure } from "./stats.js";

// Kept in Preferences (Android SharedPreferences "CapacitorStorage"), which the home-screen widget also reads.
const get = async (key) => (await Preferences.get({ key })).value;
const set = (key, value) => Preferences.set({ key, value });
const $ = (id) => document.getElementById(id);
const form = $("cfg"), status = $("status"), app = $("app");
const orgPicker = $("org"), repoPicker = $("repo"), tokenPicker = $("token"), period = $("period");
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const day = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const chevron = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
// Board columns left off the dashboard (their issues are still found by the search).
// Matched loosely: case, emoji, punctuation and "in"/"on" UAT don't matter.
const hidden = (name) => /^(new|done|to test (in|on) uat)$/.test(name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim());
const COLUMN_COLORS = ["#8B949E", "#58A6FF", "#E3B341", "#BC8CFF", "#39C5BB", "#F778BA", "#56D364"];

period.innerHTML = [0, 1, 2, 3, 5, 10, 15, 20, 30].map((d) =>
  `<option value="${d}">${d ? `Last ${d} working day${d > 1 ? "s" : ""}` : "Overall"}</option>`).join("");

function mergedChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.merged)), h = (n) => `${(n / max) * 140}px`;
  return `<figure class="card"><figcaption><div style="font-weight:600">Merged PRs per week</div><div class="sub" style="margin-top:2px">Into develop · approved first try vs. needed changes</div></figcaption>
    <div class="legend"><span><i class="swatch" style="background:var(--accent)"></i>First try</span><span><i class="swatch" style="background:var(--redo)"></i>Needed changes</span></div>
    <div class="bars">${weeks.map((w) => `<div class="bar" tabindex="0" aria-label="Week of ${day(w.start)}: ${w.merged} merged, ${w.first} approved first try">
      <span class="mono" style="font-size:12px;margin-bottom:4px">${w.merged}</span>
      <div style="height:${h(w.merged - w.first)};background:var(--redo);border-radius:4px 4px 0 0"></div><div style="height:${h(w.first)};background:var(--accent)"></div>
      <div class="tip"><div class="muted">Week of ${day(w.start)}</div><div>${w.merged} merged</div><div>${w.first} first try · ${w.merged - w.first} needed changes</div></div></div>`).join("")}</div>
    <div class="xlabels">${weeks.map((w) => `<span>${day(w.start)}</span>`).join("")}</div></figure>`;
}

function cycleChart(weeks) {
  const pts = weeks.map((w, i) => ({ ...w, x: 50 + i * (290 / (weeks.length - 1)) }));
  const known = pts.filter((p) => p.cycle != null);
  const top = Math.max(3, Math.ceil(Math.max(0, ...known.map((p) => p.cycle)) / 3) * 3), y = (v) => 140 - (v / top) * 120;
  const last = known.at(-1), first = known[0];
  const delta = last && first && last !== first ? last.cycle - first.cycle : null;
  return `<figure class="card"><figcaption><div style="font-weight:600">PR cycle time</div><div class="sub" style="margin-top:2px">Median days from opened to merged</div></figcaption>
    <div style="display:flex;align-items:baseline;gap:8px"><span class="mono" style="font-size:28px;font-weight:600">${last ? `${last.cycle.toFixed(1)} d` : "—"}</span>
      ${delta != null ? `<span style="font-size:12px;color:${delta <= 0 ? "var(--ok)" : "var(--redo)"}">${delta <= 0 ? "−" : "+"}${Math.abs(delta).toFixed(1)} d vs. ${day(first.start)}</span>` : ""}</div>
    <svg viewBox="0 0 360 170" width="100%" role="img" aria-label="Median PR cycle time per week: ${known.map((p) => `${day(p.start)} ${p.cycle.toFixed(1)} days`).join(", ") || "no merges"}" style="display:block;overflow:visible">
      <g stroke="#21262D">${[0, 1, 2].map((i) => `<line x1="28" y1="${20 + i * 40}" x2="350" y2="${20 + i * 40}"/>`).join("")}</g>
      <line x1="28" y1="140" x2="350" y2="140" stroke="#30363D"/>
      <g fill="#9AA4B2" font-size="11" font-family="Inter, sans-serif" text-anchor="end">${[0, 1, 2, 3].map((i) => `<text x="20" y="${144 - i * 40}">${i ? `${(top / 3) * i}d` : "0"}</text>`).join("")}</g>
      <g fill="#9AA4B2" font-size="11" font-family="Inter, sans-serif" text-anchor="middle">${pts.map((p) => `<text x="${p.x}" y="162">${day(p.start)}</text>`).join("")}</g>
      <polyline points="${known.map((p) => `${p.x},${y(p.cycle)}`).join(" ")}" fill="none" stroke="#4C8DFF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <g fill="#4C8DFF" stroke="#161B22" stroke-width="2">${known.map((p) => `<circle cx="${p.x}" cy="${y(p.cycle)}" r="4.5"><title>Week of ${day(p.start)}: ${p.cycle.toFixed(1)} days</title></circle>`).join("")}</g>
    </svg></figure>`;
}

function agesChart(prs, now) {
  const ages = prs.map((p) => ({ ...p, days: Math.floor((now - new Date(p.createdAt)) / 864e5) }));
  const max = Math.max(1, ...ages.map((a) => a.days));
  return `<figure class="card"><figcaption><div style="font-weight:600">How long my open PRs have waited</div><div class="sub" style="margin-top:2px">Days since opened · oldest first</div></figcaption>
    <div style="display:flex;flex-direction:column;gap:8px">${ages.map((a) => `<div class="hrow" tabindex="0" aria-label="#${a.num}, ${a.draft ? "Draft" : "Open"}, open for ${a.days} days">
      <span class="mono" style="width:44px;color:#B1BAC4">#${a.num}</span>
      <div style="flex:1 1 auto"><div style="width:${Math.max(2, (a.days / max) * 100)}%;height:14px;background:${a.draft ? "var(--dim)" : "var(--accent)"};border-radius:0 4px 4px 0"></div></div>
      <span class="mono" style="width:34px;text-align:right">${a.days}d</span><span class="muted" style="width:40px">${a.draft ? "Draft" : "Open"}</span>
      <div class="tip" style="left:40%"><div>${esc(a.title)}</div><div class="muted">${a.draft ? "Draft" : "Open"} · ${a.days} days</div></div></div>`).join("") || `<p class="muted">No open PRs.</p>`}</div>
    <div class="legend"><span><i class="swatch" style="background:var(--accent)"></i>Open</span><span><i class="swatch" style="background:var(--dim)"></i>Draft</span></div></figure>`;
}

function render(s) {
  orgPicker.querySelector("summary").innerHTML = s.orgLogo ? `<img src="${esc(s.orgLogo)}" alt="${esc(s.org)}">` : "";
  showRepo(s.repo);
  if (!s.weeks) return; // cache from an older version
  shown = s;
  const w = s.window, repoName = esc(s.repo.split("/")[1]), org = esc(s.org);
  const drafts = s.myOpen.filter((p) => p.draft).length, open = s.myOpen.length - drafts;
  const first = w ? w.oneShot : s.myOneShot, base = w ? w.develop : s.myDevelopCount, pct = base ? Math.round((first / base) * 100) : 0;
  // Every board column, empty ones too, so issues can be dropped anywhere.
  // ponytail: columns come from the first issue's board; issues on other boards only show if their status name matches.
  const options = s.myIssues.find((i) => i.move)?.move.options || [];
  const cols = options.filter((o) => !hidden(o.name)).map((o) => ({ id: o.id, label: o.name, items: s.myIssues.filter((i) => i.status === o.name) }));
  const loose = s.myIssues.filter((i) => !options.some((o) => o.name === i.status));
  if (loose.length) cols.push({ label: "No status", items: loose });

  app.innerHTML = `
  <div class="hello">${s.meAvatar ? `<img src="${esc(s.meAvatar)}" alt="">` : ""}<div>
    <h1>${esc(s.me || "Me")}</h1>
    <p class="muted" style="margin:4px 0 0">Your activity on ${repoName}${w ? ` since ${new Date(w.since).toLocaleDateString()}` : ""}${s.firstInOrg ? ` · at ${org} for ${tenure(s.firstInOrg, s.at)} (since ${new Date(s.firstInOrg).toLocaleDateString()})` : ""}</p>
  </div></div>

  <section class="stats" aria-label="Your stats">
    <div class="card wide">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
        <div><div class="label">Merged PRs</div><div class="mono" style="font-size:44px;font-weight:600;line-height:1.1;margin-top:4px">${s.myMerged}</div></div>
        <div style="text-align:right"><div class="label">Approved first try</div>
          <div style="margin-top:4px"><span class="mono" style="font-size:28px;font-weight:600">${first}</span><span class="muted"> / ${base} into develop · ${pct}%</span></div></div>
      </div>
      <div class="meter" role="img" aria-label="${pct}% of PRs merged into develop approved on first review"><div style="width:${pct}%"></div></div>
    </div>
    <div class="card"><div class="label">Open PRs</div><div class="mono big">${w ? w.open : open}</div><div class="sub">+ ${w ? w.drafts : drafts} draft${(w ? w.drafts : drafts) === 1 ? "" : "s"}${w ? " opened this period" : ""}</div></div>
    <div class="card"><div class="label">Issues assigned</div><div class="mono big">${s.myIssues.length}</div><div class="sub">${w ? `${w.issues} new this period` : "open"}</div></div>
  </section>

  <section aria-label="Trends" style="display:flex;flex-direction:column;gap:14px">
    <h2 class="section-title">Trends <span class="muted" style="font-weight:500">· last 6 weeks</span></h2>
    <div class="charts">${mergedChart(s.weeks)}${cycleChart(s.weeks)}${agesChart(s.myOpen, s.at)}</div>
  </section>

  <div class="split">
    <section class="card prs">
      <div class="head"><h2 class="section-title">My pull requests <span class="muted" style="font-weight:500">${s.myOpen.length}</span></h2>
        <a href="https://github.com/${esc(s.repo)}/pulls/@me" target="_blank" rel="noopener">View on GitHub</a></div>
      <div style="overflow-x:auto">${[...s.myOpen].reverse().map((p) => `<div class="prrow">
        <span class="chip${p.draft ? "" : " open"}" style="width:52px;justify-content:center">${p.draft ? "Draft" : "Open"}</span>
        <span class="mono muted" style="font-size:13px;width:48px">#${p.num}</span>
        <a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(p.title)}">${esc(p.title)}</a>
        ${p.type ? `<span class="mono tag">${esc(p.type)}</span>` : ""}
        <span class="muted" style="display:flex;align-items:center;gap:4px;font-size:12px;width:32px;justify-content:flex-end" aria-label="${p.comments} comments">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${p.comments}</span>
      </div>`).join("") || `<p class="muted" style="padding:16px 20px">No open PRs.</p>`}</div>
    </section>
    <aside>
      <section class="card"><h2 class="caps">${repoName} repo</h2>
        <div class="mini" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div><div class="mono">${s.prs}</div><div class="muted">Open PRs</div></div>
          <div><div class="mono">${s.issues}</div><div class="muted">Open issues</div></div>
          <div><div class="mono">${s.stars}</div><div class="muted">Star${s.stars === 1 ? "" : "s"}</div></div></div>
        <div class="sub" style="margin-top:16px">Your share of open PRs</div>
        <div class="meter" style="height:6px;margin-top:6px" role="img" aria-label="${s.myOpen.length} of ${s.prs} open PRs are yours"><div style="width:${s.prs ? (s.myOpen.length / s.prs) * 100 : 0}%"></div></div>
        <div style="margin-top:6px;font-size:12px"><span class="mono">${s.myOpen.length}</span><span class="muted"> of ${s.prs} incl. drafts</span></div>
      </section>
      <section class="card"><h2 class="caps">${org} org</h2>
        <div class="mini" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div><div class="mono">${s.orgRepos}</div><div class="muted">Repositories</div></div>
          <div><div class="mono">${s.orgPrs}</div><div class="muted">Open PRs</div></div></div>
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px">${(s.langs ? s.langs.split(", ") : []).map((l) => `<span class="chip">${esc(l)}</span>`).join("")}</div>
      </section>
    </aside>
  </div>

  <section>
    <div class="board-head"><h2 class="section-title">My issues <span class="muted" style="font-weight:500">${s.myIssues.length}</span></h2>
      <a href="https://github.com/${esc(s.repo)}/issues/assigned/@me" target="_blank" rel="noopener">Open on GitHub</a></div>
    <input id="issue-search" type="search" placeholder="Search all my issues by title or #number" aria-label="Search my issues" autocomplete="off">
    <div id="issue-results" class="results" hidden></div>
    <div class="board">${cols.map((c, n) => `<div class="col"${c.id ? ` data-option="${esc(c.id)}"` : ""}>
      <div class="col-head"><span class="dot" style="background:${c.label === "No status" ? "var(--dim)" : COLUMN_COLORS[n % COLUMN_COLORS.length]}"></span>${esc(c.label)}<span class="mono muted" style="margin-left:auto;font-size:12px">${c.items.length}</span></div>
      ${c.items.map((i) => `<div class="issue"${i.move ? ` draggable="true" data-issue="${s.myIssues.indexOf(i)}"` : ""}><a href="${esc(i.url)}" target="_blank" rel="noopener" draggable="false"><span class="mono muted">#${i.num}</span> ${esc(i.title)}</a>
        ${i.pr ? `<span class="mono tag">PR #${i.pr}</span>` : ""}</div>`).join("")}
    </div>`).join("") || `<p class="muted">No open issues assigned to you.</p>`}</div>
  </section>`;
}

let shown; // the stats on screen, for the issue moves
app.addEventListener("input", (e) => {
  if (e.target.id !== "issue-search") return;
  const q = e.target.value.trim().toLowerCase().replace(/^#/, ""), box = $("issue-results");
  box.hidden = !q;
  if (!q) return;
  const hits = shown.myIssues.filter((i) => String(i.num).startsWith(q) || i.title.toLowerCase().includes(q));
  box.innerHTML = hits.map((i) => `<a class="issue" href="${esc(i.url)}" target="_blank" rel="noopener">
    <span><span class="mono muted">#${i.num}</span> ${esc(i.title)}</span><span class="chip">${esc(i.status)}</span></a>`).join("") || `<p class="muted">No issue matches.</p>`;
});

// Drag an issue card onto another column to change its status on GitHub.
// ponytail: HTML5 drag and drop is mouse-only; touch (the Android app) would need pointer events.
let dragged;
app.addEventListener("dragstart", (e) => {
  dragged = e.target.closest?.(".issue[data-issue]");
  if (!dragged) return;
  e.dataTransfer.effectAllowed = "move";
  dragged.classList.add("dragging");
});
app.addEventListener("dragend", () => {
  dragged?.classList.remove("dragging");
  for (const c of app.querySelectorAll(".col.over")) c.classList.remove("over");
});
app.addEventListener("dragover", (e) => {
  const col = e.target.closest(".col[data-option]");
  if (!dragged || !col) return;
  e.preventDefault();
  for (const c of app.querySelectorAll(".col.over")) if (c !== col) c.classList.remove("over");
  col.classList.add("over");
});
app.addEventListener("drop", async (e) => {
  const col = e.target.closest(".col[data-option]"), card = dragged;
  if (!card || !col) return;
  e.preventDefault();
  const issue = shown.myIssues[card.dataset.issue];
  if (col.dataset.option === issue.move.optionId) return;
  const from = card.parentElement;
  col.append(card); // show it moved straight away
  status.textContent = "Moving issue…";
  try {
    await setStatus(await get("token"), issue.move, col.dataset.option);
    await refresh();
  } catch (err) {
    from.append(card);
    status.textContent = `Couldn't move the issue (${err.message})`;
  }
});

async function refresh() {
  const [token, repo, org, days] = await Promise.all(["token", "repo", "org", "days"].map(get));
  if (!token || !repo) return;
  status.textContent = "Refreshing…";
  try {
    const s = await fetchStats(token, repo, org, Number(days) || 0);
    await set("stats", JSON.stringify(s));
    render(s);
    status.textContent = `Updated ${new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (e) {
    status.textContent = `Offline or failed (${e.message})`;
  }
}

const showRepo = (r = "") => {
  const [o, n] = r.split("/");
  repoPicker.querySelector("summary").innerHTML = n
    ? `<span class="org">${esc(o)}</span><span class="sep">/</span><span>${esc(n)}</span>${chevron}` : `Pick a repo ${chevron}`;
};
const fillRepos = async (org, saved) => {
  const repos = await listRepos(await get("token"), org);
  const pick = repos.includes(saved) ? saved : repos[0] || "";
  repoPicker.querySelector(".menu").innerHTML = repos.map((r) =>
    `<button type="button" data-repo="${esc(r)}"${r === pick ? " aria-current" : ""}>${esc(r.split("/")[1])}</button>`).join("");
  showRepo(pick);
  return pick;
};

async function loadPickers() {
  if (!(await get("token"))) return;
  try {
    const orgs = await listOrgs(await get("token"));
    orgPicker.querySelector(".menu").innerHTML = orgs.map((o) =>
      `<button type="button" data-org="${esc(o.login)}" data-logo="${esc(o.avatarUrl)}"><img src="${esc(o.avatarUrl)}" alt="">${esc(o.login)}</button>`).join("");
    const org = (await get("org")) || orgs[0]?.login;
    if (org) await set("org", org), await set("repo", await fillRepos(org, await get("repo")));
  } catch (e) {
    status.textContent = `Couldn't load organizations (${e.message}).`;
  }
}

// Picking an organization, repo or period saves it and refreshes straight away.
orgPicker.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-org]");
  if (!b) return;
  orgPicker.open = false;
  orgPicker.querySelector("summary").innerHTML = `<img src="${esc(b.dataset.logo)}" alt="${esc(b.dataset.org)}">`;
  await set("org", b.dataset.org);
  await set("repo", await fillRepos(b.dataset.org));
  refresh();
});
repoPicker.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-repo]");
  if (!b) return;
  repoPicker.open = false;
  for (const x of repoPicker.querySelectorAll("[aria-current]")) x.removeAttribute("aria-current");
  b.setAttribute("aria-current", "");
  showRepo(b.dataset.repo);
  await set("repo", b.dataset.repo);
  refresh();
});
period.addEventListener("change", async () => { await set("days", period.value); refresh(); });
$("refresh").addEventListener("click", () => refresh());
// Close an open menu when tapping elsewhere.
document.addEventListener("click", (e) => { for (const d of [orgPicker, repoPicker, tokenPicker]) if (!d.contains(e.target)) d.open = false; });

const showToken = (ok) => {
  $("tokenlabel").textContent = ok ? "GitHub token connected" : "Connect GitHub token";
  tokenPicker.querySelector(".dot").style.background = ok ? "var(--ok)" : "var(--redo)";
  form.token.placeholder = ok ? "Token saved (enter to replace)" : "";
};
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await set("token", form.token.value.trim());
  form.token.value = "", tokenPicker.open = false, showToken(true);
  await loadPickers();
  refresh();
});

const cached = await get("stats");
if (cached) render(JSON.parse(cached));
period.value = (await get("days")) || "0";
showToken(!!(await get("token")));
await loadPickers();
refresh();
