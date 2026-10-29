import { crest, mark } from "./crest.js";
import { listOrgs, listRepos, PERIOD_ORDER, periodOption, sideEye, tier, toNextTier, validPeriod } from "./stats.js";

const $ = (id) => document.getElementById(id);
const form = $("form"), store = chrome.storage.local;
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const options = (sel, values, pick) => {
  sel.innerHTML = values.map((v) => `<option${v === pick ? " selected" : ""}>${esc(v)}</option>`).join("");
  sel.disabled = !values.length;
};
$("period").innerHTML = PERIOD_ORDER.map((v) => `<option value="${v}">${periodOption(v)}</option>`).join("");

function show(setup) {
  $("setup").hidden = !setup;
  $("view").hidden = setup;
  $("period").hidden = $("sep").hidden = setup;
}

async function render() {
  const { stats: s, error, period } = await store.get(["stats", "error", "period"]);
  $("period").value = validPeriod(period);
  if (!s?.mine) { $("view").innerHTML = `<p class="muted" style="padding:16px">Loading…</p>`; return; }
  const r = s.mine, t = tier(r.rate), drafts = s.myOpen.filter((p) => p.draft).length, items = sideEye(s);
  $("where").textContent = s.repo.split("/")[1];
  $("updated").textContent = `Updated ${new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  $("view").innerHTML = `
    ${error ? `<p class="error">Couldn't reach GitHub: ${esc(error)}. Showing the last data.</p>` : ""}
    <div class="hero">
      <div class="lockup" role="img" aria-label="${t ? `Silverback logo wearing your ${t.name} crest` : "Silverback logo"}">${mark(84)}<div class="pin">${crest(r.rate, 42)}</div></div>
      <div style="min-width:0">
        <div class="muted" style="font-size:12px;font-weight:500">Your Silverback rate</div>
        ${t ? `<div class="mono" style="font-size:34px;font-weight:600;line-height:1.1;margin-top:2px;color:${t.c}">${r.rate}%</div>
          <div style="font-size:13px;font-weight:700;color:${t.c}">${t.name}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${r.first} of ${r.total} merged on the first review · ${toNextTier(r.rate)}</div>`
        : `<div class="mono muted" style="font-size:34px;font-weight:600;line-height:1.1;margin-top:2px">—</div><div class="muted" style="font-size:12px;margin-top:4px">Nothing merged into develop in this period yet.</div>`}
      </div>
    </div>
    <div class="mini">
      <div><div class="mono">${s.myMerged}</div><div class="muted">Merged</div></div>
      <div><div class="mono">${s.myOpen.length - drafts}<span class="muted" style="font-size:12px"> +${drafts}</span></div><div class="muted">Open · drafts</div></div>
      <div><div class="mono">${s.myIssues.length}</div><div class="muted">Issues</div></div>
    </div>
    <div class="list">
      <div class="list-head"><b>Side-eye</b><span style="font-size:11px;color:var(--dim)">things waiting on you</span></div>
      ${items.map((it) => `<a class="item" href="${esc(it.url)}" target="_blank" rel="noopener" title="${esc(it.title)}">
        <span class="dot" style="background:${it.dot}"></span><span class="mono muted" style="font-size:12px;width:44px;flex:none">${esc(it.ref)}</span>
        <span class="t">${esc(it.title)}</span><span style="flex:none;font-size:11px;color:${it.metaColor}">${esc(it.meta)}</span></a>`).join("")
        || `<p class="muted" style="margin:4px 0">Nothing waiting on you. Go ship something.</p>`}
    </div>`;
}

// Refresh button and period changes: the light refresh state, as on the dashboard.
async function refresh() {
  document.body.classList.add("busy");
  $("refresh").disabled = true;
  $("view").setAttribute("aria-busy", "true");
  await chrome.runtime.sendMessage("refresh");
  document.body.classList.remove("busy");
  $("refresh").disabled = false;
  $("view").setAttribute("aria-busy", "false");
  render();
}
$("refresh").addEventListener("click", refresh);
$("period").addEventListener("change", async () => { await store.set({ period: $("period").value }); refresh(); });

// Settings: the token unlocks the org list, the org unlocks its repos.
async function fillOrgs(token, org, repo) {
  $("setup-error").hidden = true;
  try {
    options(form.org, (await listOrgs(token)).map((o) => o.login), org);
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
  await store.set({ ...(token && { token }), org: form.org.value, repo: form.repo.value, stats: null });
  form.token.value = "";
  show(false);
  render();
  refresh();
});
$("gear").addEventListener("click", async () => {
  const { token, org, repo } = await store.get(["token", "org", "repo"]);
  form.token.placeholder = token ? "Token saved (paste to replace)" : "github_pat_… or ghp_…";
  show($("setup").hidden);
  if (!$("setup").hidden && token) fillOrgs(token, org, repo);
});

const { token, repo } = await store.get(["token", "repo"]);
show(!token || !repo);
render();
