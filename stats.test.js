import { test } from "node:test";
import assert from "node:assert";
import { summarize, oneShot, workdaysSince, tenure, weeks, periodStart } from "./stats.js";

test("summarize", () => {
  const n = (prs, lang, size = 1) => ({ pullRequests: { totalCount: prs }, languages: { edges: lang ? [{ size, node: { name: lang } }] : [] } });
  const s = summarize({
    viewer: { login: "me" }, repository: { pullRequests: { totalCount: 3 }, issues: { totalCount: 5 }, stargazerCount: 7 },
    organization: { repositories: { totalCount: 4, nodes: [n(1, "Go", 50), n(2, "TS", 10), n(0, "TS", 10), n(4, null)] } },
    myOpen: { nodes: [] }, myMerged: { issueCount: 0 }, myFirst: { nodes: [] }, myIssues: { nodes: [] }, myDevelop: { nodes: [] },
  }, "a/b", "a");
  assert.deepEqual([s.prs, s.issues, s.stars, s.orgRepos, s.orgPrs, s.langs], [3, 5, 7, 4, 7, "Go, TS"]);
});

test("oneShot", () => {
  const pr = (oid, ...r) => ({ headRefOid: "h", reviews: { totalCount: r.length, nodes: r.map((state) => ({ state, commit: { oid } })) } });
  assert.deepEqual([pr("h", "APPROVED"), pr("old", "APPROVED"), pr("h", "COMMENTED", "APPROVED"), pr("h", "COMMENTED")].map(oneShot), [true, false, false, false]);
});

test("issues sort by board column", () => {
  const i = (title, optionId) => ({ title, url: "", projectItems: { nodes: optionId ? [{ id: "it", project: { id: "p" }, fieldValueByName: { name: optionId, optionId, field: { id: "f", options: [{ id: "todo" }, { id: "doing" }, { id: "review" }] } } }] : [] } });
  const s = summarize({
    viewer: { login: "me" }, repository: { pullRequests: { totalCount: 0 }, issues: { totalCount: 0 }, stargazerCount: 0 },
    organization: { repositories: { totalCount: 0, nodes: [] } },
    myOpen: { nodes: [] }, myMerged: { issueCount: 0 }, myFirst: { nodes: [] }, myDevelop: { nodes: [] },
    myIssues: { nodes: [i("a", "review"), i("b"), i("c", "todo"), i("d", "doing")] },
  }, "a/b", "a");
  assert.deepEqual(s.myIssues.map((x) => x.title), ["c", "d", "a", "b"]);
});

test("workdaysSince skips weekends", () => {
  const day = (d) => workdaysSince(new Date(2026, 9, d, 15), 5).getDate();
  // Oct 2026: Thu 29 -> Fri 23; Mon 26 -> Tue 20; Sun 25 -> Mon 19.
  assert.deepEqual([day(29), day(26), day(25)], [23, 20, 19]);
});

test("tenure", () => {
  assert.deepEqual([tenure("2024-07-10", "2026-10-29"), tenure("2026-10-01", "2026-10-29"), tenure("2025-10-29", "2026-10-29"), tenure("2026-08-30", "2026-10-29")],
    ["2y 3m", "28d", "1y", "1m"]);
});

test("weeks buckets merges by Monday-start week", () => {
  const pr = (created, merged) => ({ createdAt: created, mergedAt: merged, headRefOid: "h", reviews: { totalCount: 1, nodes: [{ state: "APPROVED", commit: { oid: "h" } }] } });
  const w = weeks([pr("2026-10-20T10:00", "2026-10-22T10:00"), pr("2026-10-18T10:00", "2026-10-26T10:00"), pr("2026-10-24T10:00", "2026-10-28T10:00")], new Date(2026, 9, 29), 2);
  assert.deepEqual(w.map((x) => [x.merged, x.first, Math.round(x.cycle)]), [[1, 1, 2], [2, 2, 6]]);
});

test("periodStart", () => {
  const now = new Date(2026, 9, 29, 15);
  assert.deepEqual([periodStart(now, "q").toDateString(), periodStart(now, "10").getDate(), periodStart(now, "0")], [new Date(2026, 9, 1).toDateString(), 16, null]);
});
