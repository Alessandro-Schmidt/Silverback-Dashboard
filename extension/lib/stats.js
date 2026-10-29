// The stats come from five small GraphQL queries run in parallel. One big query used to pass GitHub's ~10 s limit
// (GitHub then answers 502 without CORS headers, which the browser reports as "Failed to fetch").
// Personal stats are scoped to the configured repo; @me is the token's owner.
const REVIEWS = "reviews(first:50){ nodes{ state submittedAt } }";
const PR_SEARCH = (alias, q, fields, first = 100) => `${alias}: search(query:"${q.replace(/"/g, '\\"')}",type:ISSUE,first:${first}){ ${fields} }`;
export const queries = (repo, org, since) => {
  const [owner, name] = repo.split("/"), after = ` merged:>=${since.toISOString()}`;
  const develop = `repo:${repo} is:pr is:merged author:@me base:develop`;
  return {
    core: `{ viewer{ login avatarUrl }
      repository(owner:"${owner}",name:"${name}"){ pullRequests(states:OPEN){totalCount} issues(states:OPEN){totalCount} stargazerCount }
      organization(login:"${org}"){ avatarUrl }
      ${PR_SEARCH("myOpen", `repo:${repo} is:pr is:open author:@me`, "nodes{ ... on PullRequest { number title url isDraft createdAt headRefName comments{totalCount} reviews{totalCount} } }")}
      ${PR_SEARCH("myFirst", `org:${org} author:@me sort:created-asc`, "nodes{ ... on PullRequest { createdAt } ... on Issue { createdAt } }", 1)}
      ${PR_SEARCH("myMerged", develop + after, "issueCount", 1)}
      ${PR_SEARCH("myIssues", `repo:${repo} is:issue is:open assignee:@me`, `nodes{ ... on Issue { number title url createdAt issueType{ name } labels(first:10){ nodes{ name } } subIssuesSummary{ total completed } closedByPullRequestsReferences(first:1){ nodes{ number } }
        projectItems(first:5){ nodes{ id project{ id } fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue{ name optionId field{ ... on ProjectV2SingleSelectField{ id options{ id name } } } } } } } } }`)} }`,
    // Org pulse: one search counts the open PRs (instead of 100 per-repo counts); top 3 languages per repo, by size.
    pulse: `{ organization(login:"${org}"){ repositories(first:100){ totalCount nodes{ languages(first:3,orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name } } } } } }
      ${PR_SEARCH("orgOpen", `org:${org} is:pr is:open`, "issueCount", 1)} }`,
    mine: `{ ${PR_SEARCH("myDevelop", `${develop}${after} sort:updated-desc`, `nodes{ ... on PullRequest { createdAt mergedAt additions deletions ${REVIEWS} } }`)} }`,
    repo: `{ ${PR_SEARCH("repoMerged", `repo:${repo} is:pr is:merged base:develop${after}`, `nodes{ ... on PullRequest { mergedAt ${REVIEWS} } }`)} }`,
    org: `{ ${PR_SEARCH("orgMerged", `org:${org} is:pr is:merged${after}`, `nodes{ ... on PullRequest { mergedAt ${REVIEWS} } }`)} }`,
  };
};

// Silverback rate: a merged PR is "first try" when no CHANGES_REQUESTED review came before its first APPROVED one.
export function firstTry(pr) {
  const reviews = [...pr.reviews.nodes].sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || ""));
  const approved = reviews.findIndex((r) => r.state === "APPROVED");
  return approved >= 0 && !reviews.slice(0, approved).some((r) => r.state === "CHANGES_REQUESTED");
}
// { first, total, rate }: rate is a rounded % or null when nothing merged (shown as "—", no badge).
export function silverbackRate(prs) {
  const first = prs.filter(firstTry).length;
  return { first, total: prs.length, rate: prs.length ? Math.round((first / prs.length) * 100) : null };
}

// Tiers ("Primate Snobbery"), best first: colour, dark shade for the crest, and stars on the crest.
export const TIERS = [
  { min: 90, name: "King of the Repo", c: "#F5C84C", d: "#8A6A00", stars: 3 },
  { min: 60, name: "Silverback", c: "#56D364", d: "#1A6B2A", stars: 2 },
  { min: 30, name: "Merge Chimp", c: "#E3B341", d: "#7D5502", stars: 1 },
  { min: 0, name: "Code Monkey", c: "#F85149", d: "#8E1519", stars: 0 },
];
export const tier = (rate) => (rate == null ? null : TIERS.find((t) => rate >= t.min));
// "18 pts to Silverback", or "top of the troop".
export function toNextTier(rate) {
  const next = TIERS[TIERS.indexOf(tier(rate)) - 1];
  return rate == null ? "" : next ? `${next.min - rate} pts to ${next.name}` : "top of the troop";
}

// Start (local midnight) of the day that makes `days` working days counting back from `now`, today included.
export function workdaysSince(now, days) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  for (let n = 0; ; d.setDate(d.getDate() - 1)) if (d.getDay() % 6 && ++n === days) return d;
}

const monday = (now) => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
export const PERIODS = { w: "This week", m: "This month", "10": "Last 10 working days", "30": "Last 30 working days", q: "This quarter", "0": "Overall" };
// Menu order (object keys that look like numbers would otherwise sort first).
export const PERIOD_ORDER = ["w", "m", "10", "30", "q", "0"];
export const DEFAULT_PERIOD = "0"; // overall
export const validPeriod = (p) => (p in PERIODS ? p : DEFAULT_PERIOD);
// Start of a period: this week (Monday), this month, the last 10 or 30 working days, or this calendar quarter.
export function periodStart(now, period) {
  const d = new Date(now);
  period = validPeriod(period); // unknown → the default, before any branch (0 working days would never end)
  if (period === "0") return new Date(0); // overall: everything GitHub returns
  if (period === "w") return monday(now);
  if (period === "m") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === "q") return new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % 3), 1);
  return workdaysSince(now, Number(period));
}
const ddmmyyyy = (t) => new Date(t).toLocaleDateString("en-GB");
// Option text: the quarter says when it started, since "this quarter" alone is ambiguous.
export const periodOption = (p, now = Date.now()) =>
  p === "q" ? `This quarter (since ${periodStart(now, "q").toLocaleDateString("en-GB", { day: "numeric", month: "short" })})` : PERIODS[p];
// "this week · since Mon 26/10/2026", "since 18/09/2026", …
export function periodLabel(p, now = Date.now()) {
  if (p === "0") return "overall";
  const s = periodStart(now, p);
  return { w: `this week · since Mon ${ddmmyyyy(s)}`, m: `this month · since ${ddmmyyyy(s)}`, q: `this quarter · since ${ddmmyyyy(s)}` }[p] || `since ${ddmmyyyy(s)}`;
}

// "2y 3m" style length of time between two dates.
export function tenure(from, to) {
  const a = new Date(from), b = new Date(to);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate());
  if (months < 1) return `${Math.max(0, Math.floor((b - a) / 864e5))}d`;
  return [Math.floor(months / 12) && `${Math.floor(months / 12)}y`, months % 12 && `${months % 12}m`].filter(Boolean).join(" ");
}

export const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b), mid = v.length / 2;
  return v.length ? (v.length % 2 ? v[mid - 0.5] : (v[mid - 1] + v[mid]) / 2) : null;
};
const cycleDays = (p) => (new Date(p.mergedAt) - new Date(p.createdAt)) / 864e5;

// Merged PRs over the chosen period, for every chart: one point per day (up to 2 weeks), per week (up to 24 weeks)
// or per month, at most 24 (the most recent). Overall starts at the first merge. Each point: merged count, the
// Silverback rate (first / total / rate, null with no merges) and the median cycle time in days.
export function series(prs, since, now) {
  const first = prs.reduce((m, p) => Math.min(m, new Date(p.mergedAt)), now);
  const start = new Date(+since ? since : first), span = (now - start) / 864e5; // overall (epoch) starts at the first merge
  const unit = span <= 14 ? "day" : span <= 168 ? "week" : "month"; // ≤ 24 weekly points, else monthly
  const floor = (t) => {
    const d = new Date(t); d.setHours(0, 0, 0, 0);
    if (unit === "week") return monday(d);
    if (unit === "month") d.setDate(1);
    return d;
  };
  const next = (d) => { const n = new Date(d); unit === "day" ? n.setDate(n.getDate() + 1) : unit === "week" ? n.setDate(n.getDate() + 7) : n.setMonth(n.getMonth() + 1); return n; };
  const out = [];
  for (let b = floor(start); b <= now; b = next(b)) {
    const inB = prs.filter((p) => new Date(p.mergedAt) >= b && new Date(p.mergedAt) < next(b) && new Date(p.mergedAt) >= since);
    out.push({ start: b.getTime(), unit, merged: inB.length, ...silverbackRate(inB), cycle: median(inB.map(cycleDays)) });
  }
  return out.slice(-24);
}
// Axis tick ("26 Oct", "Oct 26") and full label ("29 Oct", "Week of 26 Oct", "October 2026") for a point.
export const tick = (b) => new Date(b.start).toLocaleDateString("en-GB", b.unit === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
export const pointLabel = (b) => b.unit === "month" ? new Date(b.start).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : `${b.unit === "week" ? "Week of " : ""}${tick(b)}`;

// "Side-eye": things waiting on you. Stale drafts, PRs nobody reviewed yet, issues ready for dev.
export function sideEye(s) {
  const age = (t) => Math.floor((s.at - new Date(t)) / 864e5);
  const heat = (d) => (d >= 21 ? "#F85149" : "#E3B341");
  const prs = s.myOpen.flatMap((p) => {
    const d = age(p.createdAt);
    if (p.draft && d >= 14) return [{ ref: `#${p.num}`, title: p.title, url: p.url, meta: `Draft · ${d} d`, dot: "#6E7681", metaColor: heat(d), pr: true }];
    if (!p.draft && !p.reviews) return [{ ref: `#${p.num}`, title: p.title, url: p.url, meta: `No review · ${d} d`, dot: "#56D364", metaColor: heat(d), pr: true }];
    return [];
  });
  const ready = s.myIssues.filter((i) => /ready/i.test(i.status))
    .map((i) => ({ ref: `#${i.num}`, title: i.title, url: i.url, meta: i.status, dot: "#E3B341", metaColor: "#9AA4B2", pr: false }));
  return [...prs, ...ready];
}

// ponytail: org PRs, languages and every personal list cover the first 100 results; paginate if that's ever exceeded.
// `period`: see periodStart; every number and chart covers only that period.
export function summarize(data, repo, org, period = DEFAULT_PERIOD, now = Date.now()) {
  period = validPeriod(period);
  const since = periodStart(now, period), recent = (t) => new Date(t) >= since;
  const mergedMine = data.myDevelop.nodes.filter((p) => recent(p.mergedAt)), mine = silverbackRate(mergedMine);
  const r = data.repository, o = data.pulse?.organization.repositories ?? { totalCount: null, nodes: [] };
  const langs = {};
  for (const n of o.nodes) for (const e of n.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size; // bytes
  return {
    repo, org, at: now, period, since: since.getTime(),
    prs: r.pullRequests.totalCount, issues: r.issues.totalCount, stars: r.stargazerCount,
    me: data.viewer.login, meAvatar: data.viewer.avatarUrl, orgRepos: o.totalCount, orgLogo: data.organization.avatarUrl,
    orgPrs: data.pulse?.orgOpen.issueCount ?? null,
    // Oldest first; `type` is the branch prefix (feat/…, fix/…).
    myOpen: data.myOpen.nodes.map((p) => ({ num: p.number, title: p.title, url: p.url, draft: p.isDraft, comments: p.comments.totalCount, reviews: p.reviews.totalCount,
      type: p.headRefName.includes("/") ? p.headRefName.split("/")[0] : "", createdAt: p.createdAt })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    myIssues: data.myIssues.nodes.map((i) => {
      const item = i.projectItems.nodes.find((n) => n.fieldValueByName?.name), v = item?.fieldValueByName;
      // Board column order; issues without a status go last.
      return { num: i.number, title: i.title, url: i.url, pr: i.closedByPullRequestsReferences?.nodes[0]?.number || 0, epic: /^epic$/i.test(i.issueType?.name) || !!i.labels?.nodes.some((l) => /^epic$/i.test(l.name)), subs: i.subIssuesSummary?.total || 0, subsDone: i.subIssuesSummary?.completed || 0,
        status: v?.name || "No status",
        // What setStatus needs; ponytail: issues with no status yet can't be moved, would need the project's Status field looked up.
        move: v ? { project: item.project.id, item: item.id, field: v.field.id, optionId: v.optionId, options: v.field.options } : null, rank: v ? v.field.options.findIndex((o) => o.id === v.optionId) : Infinity };
    }).sort((a, b) => a.rank - b.rank),
    myMerged: data.myMerged.issueCount,
    // Lines added and removed by your PRs merged into develop in the period (GitHub's green ++ and red --).
    lines: mergedMine.reduce((l, p) => ({ added: l.added + (p.additions || 0), removed: l.removed + (p.deletions || 0) }), { added: 0, removed: 0 }),
    mine, repoRate: silverbackRate(data.repoMerged.nodes), orgRate: silverbackRate(data.orgMerged.nodes),
    mySeries: series(data.myDevelop.nodes, since, now), repoSeries: series(data.repoMerged.nodes, since, now), orgSeries: series(data.orgMerged.nodes, since, now),
    newIssues: data.myIssues.nodes.filter((i) => recent(i.createdAt)).length,
    // ponytail: GitHub only exposes org join dates to admins, so tenure starts at the first PR or issue you opened in the org.
    firstInOrg: data.myFirst.nodes[0]?.createdAt || null,
    langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l).join(", "),
  };
}

async function gql(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  // A timeout or outage answers with an HTML page (and no CORS headers, so a browser only sees "Failed to fetch").
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`GitHub took too long to answer (HTTP ${res.status}). Try again in a moment`);
  if (!res.ok || json.errors) throw new Error(json.message || json.errors[0].message);
  return json.data;
}

// Moves an issue's project item to another Status column (token needs Projects read & write).
export const setStatus = (token, { project, item, field }, optionId) =>
  gql(token, `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ clientMutationId } }`,
    { p: project, i: item, f: field, o: optionId });

// Everything the details drawer shows, fetched when it opens: kind is "pr" or "issue".
const DETAIL = {
  pr: `pullRequest(number:$n){ number title url isDraft createdAt headRefName baseRefName additions deletions changedFiles comments{totalCount}
    reviews(first:50){ nodes{ state submittedAt author{ login } } } reviewRequests(first:10){ nodes{ requestedReviewer{ ... on User{ login } } } }
    commits(last:1){ nodes{ commit{ statusCheckRollup{ state } } } } closingIssuesReferences(first:1){ nodes{ number title } } }`,
  issue: `issue(number:$n){ number title url createdAt bodyHTML issueType{ name } labels(first:10){ nodes{ name color } } assignees(first:5){ nodes{ login } }
    subIssues(first:30){ nodes{ number title state } } closedByPullRequestsReferences(first:1){ nodes{ number title isDraft } }
    timelineItems(last:6,itemTypes:[ASSIGNED_EVENT,LABELED_EVENT,ISSUE_COMMENT,CROSS_REFERENCED_EVENT,RENAMED_TITLE_EVENT]){ nodes{ __typename
      ... on AssignedEvent{ createdAt actor{ login } } ... on LabeledEvent{ createdAt actor{ login } label{ name } } ... on IssueComment{ createdAt author{ login } }
      ... on CrossReferencedEvent{ createdAt actor{ login } } ... on RenamedTitleEvent{ createdAt actor{ login } } } } }`,
};
export const fetchDetail = async (token, repo, kind, n) => {
  const [owner, name] = repo.split("/");
  const data = await gql(token, `query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ ${DETAIL[kind]} } }`, { o: owner, r: name, n: Number(n) });
  return data.repository[kind === "pr" ? "pullRequest" : "issue"];
};

// Where a PR stands for the Silverback rate, from its reviews: [title, hint, colour].
export function outlook(pr) {
  const states = pr.reviews.nodes.map((r) => r.state);
  if (pr.isDraft) return ["Draft · not in review yet", "Mark it ready; it can still be a first try.", "#9AA4B2"];
  if (states.includes("CHANGES_REQUESTED")) return ["Changes requested", "Won’t count as a first try when merged.", "#D07A2A"];
  if (firstTry(pr)) return ["Approved on first review", "Counts toward your Silverback rate once merged.", "#56D364"];
  return ["Waiting for first review", "Still on track for a first try.", "#4C8DFF"];
}

// Choices for the pickers: the token owner's organizations, then that organization's repos.
export const listOrgs = async (token) =>
  (await gql(token, "{viewer{organizations(first:100){nodes{login avatarUrl}}}}")).viewer.organizations.nodes;
export const listRepos = async (token, org) =>
  (await gql(token, "query($org:String!){organization(login:$org){repositories(first:100,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{nameWithOwner}}}}", { org }))
    .organization.repositories.nodes.map((r) => r.nameWithOwner);

// Merged PRs are those into develop, since the period start. The org pulse is optional: if it fails, the rest still shows.
export async function fetchStats(token, repo, org, period = DEFAULT_PERIOD) {
  const now = Date.now(), since = periodStart(now, validPeriod(period)), q = queries(repo, org, since);
  const [core, pulse, mine, repoM, orgM] = await Promise.all([
    gql(token, q.core), gql(token, q.pulse).catch(() => null), gql(token, q.mine), gql(token, q.repo), gql(token, q.org)]);
  return summarize({ ...core, pulse, ...mine, ...repoM, ...orgM }, repo, org, period, now);
}

// ---- Team view ----

const TEAM_QUERY = `query($org:String!,$q:String!,$after:String){
  organization(login:$org){ membersWithRole(first:100){ edges{ role node{ login avatarUrl } } } }
  search(query:$q,type:ISSUE,first:100,after:$after){ pageInfo{ hasNextPage endCursor } nodes{ ... on PullRequest {
    number title url isDraft state createdAt mergedAt baseRefName author{ login avatarUrl }
    reviews(first:50){ nodes{ state submittedAt author{ login } } } } } }
}`;

// Every PR of the repo touched since the period start, with its reviews.
// ponytail: stops at 5 pages (500 PRs); raise the cap for very busy repos.
export async function fetchTeam(token, repo, org, period = DEFAULT_PERIOD) {
  const now = Date.now(), since = periodStart(now, validPeriod(period)), prs = [];
  let data, after = null;
  for (let page = 0; page < 5; page++) {
    data = await gql(token, TEAM_QUERY, { org, q: `repo:${repo} is:pr updated:>=${since.toISOString()}`, after });
    prs.push(...data.search.nodes);
    if (!data.search.pageInfo.hasNextPage) break;
    after = data.search.pageInfo.endCursor;
  }
  return summarizeTeam(prs, data.organization.membersWithRole.edges, period, now);
}

export function summarizeTeam(prs, members, period = DEFAULT_PERIOD, now = Date.now()) {
  const since = periodStart(now, validPeriod(period)), recent = (t) => t && new Date(t) >= since;
  const human = (a) => a && !a.login.endsWith("[bot]");
  const merged = prs.filter((p) => p.state === "MERGED" && p.baseRefName === "develop" && human(p.author));
  const inPeriod = merged.filter((p) => recent(p.mergedAt));
  const people = new Map(members.map((e) => [e.node.login, { login: e.node.login, avatar: e.node.avatarUrl, owner: e.role === "ADMIN" }]));
  const person = (a) => people.get(a.login) || people.set(a.login, { login: a.login, avatar: a.avatarUrl, owner: false }).get(a.login);
  for (const p of prs) if (human(p.author)) person(p.author);

  const rows = [...people.values()].map((m) => {
    const mine = inPeriod.filter((p) => p.author.login === m.login);
    const reviews = prs.reduce((n, p) => n + (p.author?.login === m.login ? 0
      : p.reviews.nodes.filter((r) => r.author?.login === m.login && recent(r.submittedAt)).length), 0);
    const open = prs.filter((p) => p.state === "OPEN" && p.author?.login === m.login).length;
    const rate = silverbackRate(mine);
    return { ...m, merged: mine.length, open, reviews, rate: rate.rate, cycle: median(mine.map(cycleDays)),
      trend: series(merged.filter((p) => p.author.login === m.login), since, now).map((b) => b.merged) };
  }).filter((m) => m.merged || m.open || m.reviews);

  const teamCycle = median(inPeriod.map(cycleDays));
  const stale = prs.filter((p) => p.state === "OPEN" && p.isDraft && (now - new Date(p.createdAt)) / 864e5 >= 14);
  const alerts = [];
  if (stale.length) alerts.push({ title: `${stale.slice(0, 3).map((p) => `#${p.number}`).join(", ")}${stale.length > 3 ? ` and ${stale.length - 3} more` : ""} ${stale.length === 1 ? "has" : "have"} been draft${stale.length === 1 ? "" : "s"} for 14+ days`,
    detail: `${[...new Set(stale.map((p) => p.author?.login).filter(Boolean))].join(", ")} · consider splitting or closing` });
  for (const m of rows) if (m.reviews >= 5 && m.reviews >= 3 * Math.max(1, m.merged))
    alerts.push({ title: `${m.login} gives ${(m.reviews / Math.max(1, m.merged)).toFixed(1)}× more reviews than they merge`, detail: "Review load is uneven; spread reviews across the team" });
  for (const m of rows) if (teamCycle && m.merged >= 2 && m.cycle > 1.5 * teamCycle)
    alerts.push({ title: `${m.login}’s cycle time is ${m.cycle.toFixed(1)} d, against ${teamCycle.toFixed(1)} d for the team`, detail: m.rate == null ? "" : `Silverback rate ${m.rate}% (${tier(m.rate).name})` });

  return {
    at: now, period, since: since.getTime(), rows, alerts,
    rate: silverbackRate(inPeriod), series: series(merged, since, now), merged: inPeriod.length, cycle: teamCycle,
    open: prs.filter((p) => p.state === "OPEN").length, reviews: rows.reduce((n, m) => n + m.reviews, 0),
  };
}
