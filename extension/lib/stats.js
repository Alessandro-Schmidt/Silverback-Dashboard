// One GraphQL query for every tile. ETag doesn't apply: GraphQL is a POST.
// Personal stats are scoped to the configured repo; @me is the token's owner.
const REVIEWS = "reviews(first:50){ nodes{ state submittedAt } }";
export const QUERY = `query($owner:String!,$name:String!,$org:String!,$qOpen:String!,$qMerged:String!,$qIssues:String!,$qDevelop:String!,$qFirst:String!,$qRepo:String!,$qOrg:String!){
  viewer{ login avatarUrl }
  repository(owner:$owner,name:$name){ pullRequests(states:OPEN){totalCount} issues(states:OPEN){totalCount} stargazerCount }
  organization(login:$org){ avatarUrl repositories(first:100){ totalCount nodes{ pullRequests(states:OPEN){totalCount} languages(first:10){ edges{ size node{ name } } } } } }
  myOpen: search(query:$qOpen,type:ISSUE,first:100){ nodes{ ... on PullRequest { number title url isDraft createdAt headRefName comments{totalCount} reviews{totalCount} } } }
  myFirst: search(query:$qFirst,type:ISSUE,first:1){ nodes{ ... on PullRequest { createdAt } ... on Issue { createdAt } } }
  myMerged: search(query:$qMerged,type:ISSUE,first:1){ issueCount }
  myIssues: search(query:$qIssues,type:ISSUE,first:100){ nodes{ ... on Issue { number title url createdAt closedByPullRequestsReferences(first:1){ nodes{ number } }
    projectItems(first:5){ nodes{ id project{ id } fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue{ name optionId field{ ... on ProjectV2SingleSelectField{ id options{ id name } } } } } } } } } }
  myDevelop: search(query:$qDevelop,type:ISSUE,first:100){ nodes{ ... on PullRequest { createdAt mergedAt additions deletions ${REVIEWS} } } }
  repoMerged: search(query:$qRepo,type:ISSUE,first:100){ nodes{ ... on PullRequest { mergedAt ${REVIEWS} } } }
  orgMerged: search(query:$qOrg,type:ISSUE,first:100){ nodes{ ... on PullRequest { mergedAt ${REVIEWS} } } }
}`;

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
export const DEFAULT_PERIOD = "30";
export const validPeriod = (p) => (p in PERIODS ? p : DEFAULT_PERIOD);
// Start of a period: this week (Monday), this month, the last 10 or 30 working days, or this calendar quarter.
export function periodStart(now, period) {
  const d = new Date(now);
  if (period === "0") return new Date(0); // overall: everything GitHub returns
  if (period === "w") return monday(now);
  if (period === "m") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === "q") return new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % 3), 1);
  return workdaysSince(now, Number(validPeriod(period)));
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

// The last `n` Monday-start weeks of merged PRs: count, first-try count, median days opened→merged.
export function weeks(prs, now, n = 6) {
  const first = monday(now);
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(first); start.setDate(start.getDate() - 7 * (n - 1 - i));
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const inWeek = prs.filter((p) => new Date(p.mergedAt) >= start && new Date(p.mergedAt) < end);
    return { start: start.getTime(), merged: inWeek.length, first: inWeek.filter(firstTry).length, cycle: median(inWeek.map(cycleDays)) };
  });
}

// Silverback rate over the period, for the rate charts: by day up to 2 weeks, by week up to ~6 months, else by month
// (at most 24 points, the most recent). Overall starts at the first merge. A bucket with no merges has rate null.
export function rateSeries(prs, since, now) {
  const first = prs.reduce((m, p) => Math.min(m, new Date(p.mergedAt)), now);
  const start = new Date(+since ? since : first), span = (now - start) / 864e5; // overall (epoch) starts at the first merge
  const unit = span <= 14 ? "day" : span <= 182 ? "week" : "month";
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
    out.push({ start: b.getTime(), unit, ...silverbackRate(inB) });
  }
  return out.slice(-24);
}

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
// `period`: see periodStart; the personal numbers count only that period. Trends always cover the last 6 weeks.
export function summarize(data, repo, org, period = DEFAULT_PERIOD, now = Date.now()) {
  period = validPeriod(period);
  const since = periodStart(now, period), recent = (t) => new Date(t) >= since;
  const mergedMine = data.myDevelop.nodes.filter((p) => recent(p.mergedAt)), mine = silverbackRate(mergedMine);
  const r = data.repository, o = data.organization.repositories;
  const langs = {};
  for (const n of o.nodes) for (const e of n.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size; // bytes
  return {
    repo, org, at: now, period, since: since.getTime(),
    prs: r.pullRequests.totalCount, issues: r.issues.totalCount, stars: r.stargazerCount,
    me: data.viewer.login, meAvatar: data.viewer.avatarUrl, orgRepos: o.totalCount, orgLogo: data.organization.avatarUrl,
    orgPrs: o.nodes.reduce((s, n) => s + n.pullRequests.totalCount, 0),
    // Oldest first; `type` is the branch prefix (feat/…, fix/…).
    myOpen: data.myOpen.nodes.map((p) => ({ num: p.number, title: p.title, url: p.url, draft: p.isDraft, comments: p.comments.totalCount, reviews: p.reviews.totalCount,
      type: p.headRefName.includes("/") ? p.headRefName.split("/")[0] : "", createdAt: p.createdAt })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    myIssues: data.myIssues.nodes.map((i) => {
      const item = i.projectItems.nodes.find((n) => n.fieldValueByName?.name), v = item?.fieldValueByName;
      // Board column order; issues without a status go last.
      return { num: i.number, title: i.title, url: i.url, pr: i.closedByPullRequestsReferences?.nodes[0]?.number || 0, status: v?.name || "No status",
        // What setStatus needs; ponytail: issues with no status yet can't be moved, would need the project's Status field looked up.
        move: v ? { project: item.project.id, item: item.id, field: v.field.id, optionId: v.optionId, options: v.field.options } : null, rank: v ? v.field.options.findIndex((o) => o.id === v.optionId) : Infinity };
    }).sort((a, b) => a.rank - b.rank),
    myMerged: data.myMerged.issueCount,
    // Lines added and removed by your PRs merged into develop in the period (GitHub's green ++ and red --).
    lines: mergedMine.reduce((l, p) => ({ added: l.added + (p.additions || 0), removed: l.removed + (p.deletions || 0) }), { added: 0, removed: 0 }),
    mine, repoRate: silverbackRate(data.repoMerged.nodes), orgRate: silverbackRate(data.orgMerged.nodes),
    mySeries: rateSeries(data.myDevelop.nodes, since, now), repoSeries: rateSeries(data.repoMerged.nodes, since, now), orgSeries: rateSeries(data.orgMerged.nodes, since, now),
    newIssues: data.myIssues.nodes.filter((i) => recent(i.createdAt)).length,
    weeks: weeks(data.myDevelop.nodes, now),
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
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(json.message || json.errors[0].message);
  return json.data;
}

// Moves an issue's project item to another Status column (token needs Projects read & write).
export const setStatus = (token, { project, item, field }, optionId) =>
  gql(token, `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ clientMutationId } }`,
    { p: project, i: item, f: field, o: optionId });

// Choices for the pickers: the token owner's organizations, then that organization's repos.
export const listOrgs = async (token) =>
  (await gql(token, "{viewer{organizations(first:100){nodes{login avatarUrl}}}}")).viewer.organizations.nodes;
export const listRepos = async (token, org) =>
  (await gql(token, "query($org:String!){organization(login:$org){repositories(first:100,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{nameWithOwner}}}}", { org }))
    .organization.repositories.nodes.map((r) => r.nameWithOwner);

// One query per refresh. Merged PRs are those into develop; the merged list reaches back to the period start or 6 weeks for the trends, whichever is earlier.
export async function fetchStats(token, repo, org, period = DEFAULT_PERIOD) {
  const [owner, name] = repo.split("/");
  const now = Date.now(), since = periodStart(now, validPeriod(period)), sixWeeks = new Date(now - 42 * 864e5);
  const from = since < sixWeeks ? since : sixWeeks, after = (d) => ` merged:>=${d.toISOString()}`;
  const develop = `repo:${repo} is:pr is:merged author:@me base:develop`;
  return summarize(await gql(token, QUERY, { owner, name, org,
      qOpen: `repo:${repo} is:pr is:open author:@me`, qMerged: develop + after(since),
      qIssues: `repo:${repo} is:issue is:open assignee:@me`, qDevelop: `${develop}${after(from)} sort:updated-desc`,
      qFirst: `org:${org} author:@me sort:created-asc`,
      qRepo: `repo:${repo} is:pr is:merged base:develop${after(since)}`, qOrg: `org:${org} is:pr is:merged${after(since)}` }), repo, org, period, now);
}

// ---- Team view ----

const TEAM_QUERY = `query($org:String!,$q:String!,$after:String){
  organization(login:$org){ membersWithRole(first:100){ edges{ role node{ login avatarUrl } } } }
  search(query:$q,type:ISSUE,first:100,after:$after){ pageInfo{ hasNextPage endCursor } nodes{ ... on PullRequest {
    number title url isDraft state createdAt mergedAt baseRefName author{ login avatarUrl }
    reviews(first:50){ nodes{ state submittedAt author{ login } } } } } }
}`;

// Every PR of the repo touched since the period start (or 6 weeks back, for the sparklines), with its reviews.
// ponytail: stops at 5 pages (500 PRs); raise the cap for very busy repos.
export async function fetchTeam(token, repo, org, period = DEFAULT_PERIOD) {
  const now = Date.now(), since = periodStart(now, validPeriod(period)), sixWeeks = monday(now - 35 * 864e5);
  const from = since < sixWeeks ? since : sixWeeks, prs = [];
  let data, after = null;
  for (let page = 0; page < 5; page++) {
    data = await gql(token, TEAM_QUERY, { org, q: `repo:${repo} is:pr updated:>=${from.toISOString()}`, after });
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
      weekly: weeks(merged.filter((p) => p.author.login === m.login), now).map((w) => w.merged) };
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
    rate: silverbackRate(inPeriod), series: rateSeries(inPeriod, since, now), merged: inPeriod.length, cycle: teamCycle,
    open: prs.filter((p) => p.state === "OPEN").length, reviews: rows.reduce((n, m) => n + m.reviews, 0),
    weeks: weeks(merged, now).map((w) => ({ start: w.start, total: w.merged })),
  };
}
