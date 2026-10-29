import { test } from "node:test";
import assert from "node:assert";
import { summarize, firstTry, silverbackRate, tier, toNextTier, workdaysSince, tenure, series, periodStart, periodOption, periodLabel, PERIOD_ORDER, PERIODS, sideEye, summarizeTeam, outlook } from "./extension/lib/stats.js";

const rev = (...states) => ({ nodes: states.map((state, i) => ({ state, submittedAt: `2026-10-0${i + 1}T10:00:00Z`, author: { login: "rev" } })) });
const base = (extra = {}) => ({
  viewer: { login: "me" }, repository: { pullRequests: { totalCount: 0 }, issues: { totalCount: 0 }, stargazerCount: 0 },
  organization: {}, pulse: { organization: { repositories: { totalCount: 0, nodes: [] } }, orgOpen: { issueCount: 0 } },
  myOpen: { nodes: [] }, myMerged: { issueCount: 0 }, myFirst: { nodes: [] }, myIssues: { nodes: [] }, myDevelop: { nodes: [] },
  repoMerged: { nodes: [] }, orgMerged: { nodes: [] }, ...extra,
});

test("summarize: repo and org pulse", () => {
  const n = (prs, lang, size = 1) => ({ pullRequests: { totalCount: prs }, languages: { edges: lang ? [{ size, node: { name: lang } }] : [] } });
  const s = summarize(base({
    repository: { pullRequests: { totalCount: 3 }, issues: { totalCount: 5 }, stargazerCount: 7 },
    pulse: { organization: { repositories: { totalCount: 4, nodes: [n(1, "Go", 50), n(2, "TS", 10), n(0, "TS", 10), n(4, null)] } }, orgOpen: { issueCount: 7 } },
    repoMerged: { nodes: [{ reviews: rev("APPROVED") }, { reviews: rev("CHANGES_REQUESTED", "APPROVED") }] },
  }), "a/b", "a");
  assert.deepEqual([s.prs, s.issues, s.stars, s.orgRepos, s.orgPrs, s.langs, s.repoRate.rate, s.orgRate.rate], [3, 5, 7, 4, 7, "Go, TS", 50, null]);
});

test("firstTry: no change request before the first approval", () => {
  assert.deepEqual([rev("APPROVED"), rev("COMMENTED", "APPROVED"), rev("CHANGES_REQUESTED", "APPROVED"), rev("APPROVED", "CHANGES_REQUESTED"), rev("COMMENTED"), rev()]
    .map((reviews) => firstTry({ reviews })), [true, true, false, true, false, false]);
});

test("tiers at their edges, and no rate with nothing merged", () => {
  assert.deepEqual([0, 29, 30, 59, 60, 89, 90, 100].map((r) => tier(r).name),
    ["Code Monkey", "Code Monkey", "Merge Chimp", "Merge Chimp", "Silverback", "Silverback", "King of the Repo", "King of the Repo"]);
  assert.deepEqual([silverbackRate([]).rate, tier(null), toNextTier(48), toNextTier(95)], [null, null, "12 pts to Silverback", "top of the troop"]);
  assert.equal(silverbackRate([{ reviews: rev("APPROVED") }, { reviews: rev("CHANGES_REQUESTED", "APPROVED") }, { reviews: rev("APPROVED") }]).rate, 67);
});

test("issues sort by board column", () => {
  const i = (title, optionId) => ({ title, url: "", projectItems: { nodes: optionId ? [{ id: "it", project: { id: "p" }, fieldValueByName: { name: optionId, optionId, field: { id: "f", options: [{ id: "todo" }, { id: "doing" }, { id: "review" }] } } }] : [] } });
  const s = summarize(base({ myIssues: { nodes: [i("a", "review"), i("b"), i("c", "todo"), i("d", "doing")] } }), "a/b", "a");
  assert.deepEqual(s.myIssues.map((x) => x.title), ["c", "d", "a", "b"]);
});

test("periods", () => {
  const now = new Date(2026, 9, 29, 15); // Thursday 29 Oct 2026
  assert.deepEqual(["w", "m", "q", "10", "30"].map((p) => periodStart(now, p).toDateString()),
    [new Date(2026, 9, 26), new Date(2026, 9, 1), new Date(2026, 9, 1), new Date(2026, 9, 16), new Date(2026, 8, 18)].map((d) => d.toDateString()));
  assert.equal(periodStart(now, "bogus").getTime(), 0); // unknown → the default, Overall
  assert.deepEqual([periodOption("q", now), periodLabel("w", now), periodLabel("30", now), periodOption("0"), periodLabel("0", now), periodStart(now, "0").getTime()],
    ["This quarter (since 1 Oct)", "this week · since Mon 26/10/2026", "since 18/09/2026", "Overall", "overall", 0]);
});

test("period menu lists every period in order", () => {
  assert.deepEqual([...PERIOD_ORDER].sort(), Object.keys(PERIODS).sort());
  assert.deepEqual(PERIOD_ORDER.map((p) => PERIODS[p]).at(-1), "Overall");
});

test("workdaysSince skips weekends", () => {
  const day = (d) => workdaysSince(new Date(2026, 9, d, 15), 5).getDate();
  assert.deepEqual([day(29), day(26), day(25)], [23, 20, 19]);
});

test("tenure", () => {
  assert.deepEqual([tenure("2024-07-10", "2026-10-29"), tenure("2026-10-01", "2026-10-29"), tenure("2025-10-29", "2026-10-29"), tenure("2026-08-30", "2026-10-29")],
    ["2y 3m", "28d", "1y", "1m"]);
});

test("series buckets merges by week over the period", () => {
  const pr = (created, merged) => ({ createdAt: created, mergedAt: merged, reviews: rev("APPROVED") });
  const now = new Date(2026, 9, 29), w = series([pr("2026-10-20T10:00", "2026-10-22T10:00"), pr("2026-10-18T10:00", "2026-10-26T10:00"), pr("2026-10-24T10:00", "2026-10-28T10:00")], new Date(2026, 9, 1), now);
  assert.deepEqual(w.slice(-2).map((x) => [x.unit, x.merged, x.first, Math.round(x.cycle)]), [["week", 1, 1, 2], ["week", 2, 2, 6]]);
});

test("sideEye: stale drafts, unreviewed PRs, ready issues", () => {
  const at = Date.parse("2026-10-29T12:00:00Z"), ago = (d) => new Date(at - d * 864e5).toISOString();
  const s = { at, myOpen: [{ num: 1, title: "a", draft: true, reviews: 0, createdAt: ago(21) }, { num: 2, title: "b", draft: true, reviews: 0, createdAt: ago(3) },
    { num: 3, title: "c", draft: false, reviews: 0, createdAt: ago(12) }, { num: 4, title: "d", draft: false, reviews: 2, createdAt: ago(30) }],
    myIssues: [{ num: 9, title: "i", status: "Ready for dev" }, { num: 8, title: "j", status: "To do" }] };
  assert.deepEqual(sideEye(s).map((x) => `${x.ref} ${x.meta}`), ["#1 Draft · 21 d", "#3 No review · 12 d", "#9 Ready for dev"]);
});

test("summarizeTeam: per-member merged, reviews given and rate", () => {
  const now = new Date(2026, 9, 29, 15), pr = (author, extra) => ({ number: 1, author: { login: author }, baseRefName: "develop", isDraft: false, reviews: { nodes: [] }, createdAt: "2026-10-20T10:00:00Z", ...extra });
  const prs = [
    pr("ana", { state: "MERGED", mergedAt: "2026-10-22T10:00:00Z", reviews: { nodes: [{ state: "APPROVED", submittedAt: "2026-10-21T10:00:00Z", author: { login: "bo" } }] } }),
    pr("ana", { state: "MERGED", mergedAt: "2026-10-23T10:00:00Z", reviews: { nodes: [{ state: "CHANGES_REQUESTED", submittedAt: "2026-10-21T10:00:00Z", author: { login: "bo" } }, { state: "APPROVED", submittedAt: "2026-10-22T10:00:00Z", author: { login: "bo" } }] } }),
    pr("bo", { state: "OPEN" }), pr("dependabot[bot]", { state: "MERGED", mergedAt: "2026-10-22T10:00:00Z" }),
  ];
  const t = summarizeTeam(prs, [{ role: "ADMIN", node: { login: "bo", avatarUrl: "" } }, { role: "MEMBER", node: { login: "idle", avatarUrl: "" } }], "30", now);
  const row = (l) => t.rows.find((m) => m.login === l);
  assert.deepEqual([t.rows.length, row("ana").merged, row("ana").rate, row("bo").reviews, row("bo").open, row("bo").owner, t.rate.rate, t.merged], [2, 2, 50, 3, 1, true, 50, 2]);
});

test("series buckets by day, week or month with the period", () => {
  const now = new Date(2026, 9, 29, 15), at = (d) => new Date(2026, 9, d, 12).toISOString();
  const pr = (d, ...st) => ({ mergedAt: at(d), reviews: rev(...st) });
  const prs = [pr(27, "APPROVED"), pr(27, "CHANGES_REQUESTED", "APPROVED"), pr(28, "APPROVED"), pr(20, "APPROVED")];
  const week = series(prs, periodStart(now, "w"), now);
  assert.deepEqual([week[0].unit, week.length, week.map((b) => b.rate)], ["day", 4, [null, 50, 100, null]]);
  const month = series(prs, periodStart(now, "30"), now);
  assert.deepEqual([month[0].unit, month.at(-1).rate, month.at(-2).rate], ["week", 67, 100]);
  assert.equal(series(prs, periodStart(now, "0"), now)[0].unit, "day"); // overall starts at the first merge (20 Oct)
});

test("summarize without the optional org pulse", () => {
  const s = summarize(base({ pulse: null }), "a/b", "a");
  assert.deepEqual([s.orgRepos, s.orgPrs, s.langs], [null, null, ""]);
});

test("lines added and removed by your merged PRs in the period", () => {
  const now = Date.now(), ago = (d) => new Date(now - d * 864e5).toISOString();
  const s = summarize(base({ myDevelop: { nodes: [
    { createdAt: ago(5), mergedAt: ago(2), additions: 120, deletions: 30, reviews: rev("APPROVED") },
    { createdAt: ago(9), mergedAt: ago(1), additions: 5, deletions: 70, reviews: rev("APPROVED") },
    { createdAt: ago(200), mergedAt: ago(190), additions: 999, deletions: 999, reviews: rev("APPROVED") } ] } }), "a/b", "a", "30", now);
  assert.deepEqual(s.lines, { added: 125, removed: 100 });
});

test("outlook: where an open PR stands for the Silverback rate", () => {
  const o = (isDraft, ...s) => outlook({ isDraft, reviews: rev(...s) })[0];
  assert.equal(o(true, "APPROVED"), "Draft · not in review yet");
  assert.equal(o(false, "CHANGES_REQUESTED", "APPROVED"), "Changes requested");
  assert.equal(o(false, "COMMENTED", "APPROVED"), "Approved on first review");
  assert.equal(o(false), "Waiting for first review");
});
