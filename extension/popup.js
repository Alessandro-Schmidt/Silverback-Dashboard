import { listOrgs, listRepos } from "./stats.js";

const $ = (id) => document.getElementById(id);
const form = $("form");
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const store = chrome.storage.local;
const PERIODS = { "30": "last 30 working days", "10": "last 10 working days", q: "this quarter", "0": "overall" };
const options = (sel, values, pick) => {
  sel.innerHTML = values.map((v) => `<option${v === pick ? " selected" : ""}>${esc(v)}</option>`).join("");
  sel.disabled = !values.length;
};

function show(setup) {
  $("setup").hidden = !setup;
  $("view").hidden = setup;
}

async function render() {
  const { stats: s, error } = await store.get(["stats", "error"]);
  $("error").textContent = error ? `Couldn't reach GitHub: ${error}` : "";
  if (!s) return;
  const drafts = s.myOpen.filter((p) => p.draft).length, pct = s.myDevelopCount ? Math.round((s.myOneShot / s.myDevelopCount) * 100) : 0;
  $("where").textContent = s.repo;
  $("updated").textContent = `Updated ${new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${PERIODS[s.period] || ""}`;
  $("view").innerHTML = `
    <div class="stats">
      <div class="card"><div class="num mono">${s.myOpen.length - drafts}</div><div class="label">Open PRs · + ${drafts} draft${drafts === 1 ? "" : "s"}</div></div>
      <div class="card"><div class="num mono">${s.myMerged}</div><div class="label">Merged into develop</div></div>
      <div class="card"><div class="num mono">${pct}%</div><div class="label">Approved first try · ${s.myOneShot}/${s.myDevelopCount}</div>
        <div class="meter" role="img" aria-label="${pct}% approved first try"><div style="width:${pct}%"></div></div></div>
      <div class="card"><div class="num mono">${s.myIssues.length}</div><div class="label">Issues assigned · ${s.newIssues} new</div></div>
    </div>
    <section><h2>My open PRs · oldest first</h2>
      ${s.myOpen.map((p) => `<div class="pr"><span class="mono muted">#${p.num}</span>
        <a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(p.title)}">${esc(p.title)}</a>
        <span class="muted">${Math.floor((s.at - new Date(p.createdAt)) / 864e5)}d</span><span class="chip${p.draft ? "" : " open"}">${p.draft ? "Draft" : "Open"}</span></div>`).join("")
        || `<p class="muted">No open PRs. Go ship something.</p>`}
    </section>`;
}

async function refresh() {
  $("refresh").disabled = true;
  await chrome.runtime.sendMessage("refresh");
  $("refresh").disabled = false;
  render();
}

// Setup: the token unlocks the org list, the org unlocks its repos.
async function fillOrgs(token, org, repo) {
  $("setup-error").hidden = true;
  try {
    const orgs = (await listOrgs(token)).map((o) => o.login);
    options(form.org, orgs, org);
    options(form.repo, form.org.value ? await listRepos(token, form.org.value) : [], repo);
  } catch (e) {
    $("setup-error").textContent = `GitHub said: ${e.message}`;
    $("setup-error").hidden = false;
  }
}
form.token.addEventListener("change", () => form.token.value.trim() && fillOrgs(form.token.value.trim()));
form.org.addEventListener("change", async () => {
  const { token } = await store.get("token");
  options(form.repo, await listRepos(form.token.value.trim() || token, form.org.value));
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.repo.value) return;
  const token = form.token.value.trim();
  await store.set({ ...(token && { token }), org: form.org.value, repo: form.repo.value, period: form.period.value, stats: null });
  form.token.value = "";
  show(false);
  $("view").innerHTML = `<p class="muted">Loading…</p>`;
  refresh();
});

$("refresh").addEventListener("click", refresh);
$("gear").addEventListener("click", async () => {
  const { token, org, repo, period = "30" } = await store.get(["token", "org", "repo", "period"]);
  form.period.value = period;
  form.token.placeholder = token ? "Token saved (paste to replace)" : "github_pat_… or ghp_…";
  show($("setup").hidden);
  if (!$("setup").hidden && token) fillOrgs(token, org, repo);
});

const { token, repo } = await store.get(["token", "repo"]);
show(!token || !repo);
render();
