import { test } from "node:test";
import assert from "node:assert";
import { summarize, firstTry, silverbackRate, tier, toNextTier, workdaysSince, tenure, weeks, periodStart, periodOption, periodLabel, PERIOD_ORDER, PERIODS, sideEye, summarizeTeam } from "./stats.js";

const rev = (...states) => ({ nodes: states.map((state, i) => ({ state, submittedAt: `2026-10-0${i + 1}T10:00:00Z`, author: { login: "rev" } })) });
const base = (extra = {}) => ({
  viewer: { login: "me" }, repository: { pullRequests: { totalCount: 0 }, issues: { totalCount: 0 }, stargazerCount: 0 },
  organization: { repositories: { totalCount: 0, nodes: [] } },
  myOpen: { nodes: [] }, myMerged: { issueCount: 0 }, myFirst: { nodes: [] }, myIssues: { nodes: [] }, myDevelop: { nodes: [] },
  repoMerged: { nodes: [] }, orgMerged: { nodes: [] }, ...extra,
});

test("summarize: repo and org pulse", () => {
  const n = (prs, lang, size = 1) => ({ pullRequests: { totalCount: prs }, languages: { edges: lang ? [{ size, node: { name: lang } }] : [] } });
  const s = summarize(base({
    repository: { pullRequests: { totalCount: 3 }, issues: { totalCount: 5 }, stargazerCount: 7 },
    organization: { repositories: { totalCount: 4, nodes: [n(1, "Go", 50), n(2, "TS", 10), n(0, "TS", 10), n(4, null)] } },
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
  assert.deepEqual(["w", "m", "q", "10", "30", "bogus"].map((p) => periodStart(now, p).toDateString()),
    [new Date(2026, 9, 26), new Date(2026, 9, 1), new Date(2026, 9, 1), new Date(2026, 9, 16), new Date(2026, 8, 18), new Date(2026, 8, 18)].map((d) => d.toDateString()));
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

test("weeks buckets merges by Monday-start week", () => {
  const pr = (created, merged) => ({ createdAt: created, mergedAt: merged, reviews: rev("APPROVED") });
  const w = weeks([pr("2026-10-20T10:00", "2026-10-22T10:00"), pr("2026-10-18T10:00", "2026-10-26T10:00"), pr("2026-10-24T10:00", "2026-10-28T10:00")], new Date(2026, 9, 29), 2);
  assert.deepEqual(w.map((x) => [x.merged, x.first, Math.round(x.cycle)]), [[1, 1, 2], [2, 2, 6]]);
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
