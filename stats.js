// One GraphQL query for every tile. ETag doesn't apply: GraphQL is a POST.
// Personal stats are scoped to the configured repo; @me is the token's owner.
export const QUERY = `query($owner:String!,$name:String!,$org:String!,$qOpen:String!,$qMerged:String!,$qIssues:String!,$qDevelop:String!,$qFirst:String!){
  viewer{ login avatarUrl }
  repository(owner:$owner,name:$name){ pullRequests(states:OPEN){totalCount} issues(states:OPEN){totalCount} stargazerCount }
  organization(login:$org){ avatarUrl repositories(first:100){ totalCount nodes{ pullRequests(states:OPEN){totalCount} primaryLanguage{name} } } }
  myOpen: search(query:$qOpen,type:ISSUE,first:100){ issueCount nodes{ ... on PullRequest { number title url isDraft createdAt headRefName comments{totalCount} } } }
  myFirst: search(query:$qFirst,type:ISSUE,first:1){ nodes{ ... on PullRequest { createdAt } ... on Issue { createdAt } } }
  myMerged: search(query:$qMerged,type:ISSUE,first:1){ issueCount }
  myIssues: search(query:$qIssues,type:ISSUE,first:100){ issueCount nodes{ ... on Issue { number title url createdAt closedByPullRequestsReferences(first:1,includeClosedPrs:true){ nodes{ number } }
    projectItems(first:5){ nodes{ id project{ id } fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue{ name optionId field{ ... on ProjectV2SingleSelectField{ id options{ id name } } } } } } } } } }
  myDevelop: search(query:$qDevelop,type:ISSUE,first:100){ nodes{ ... on PullRequest { headRefOid createdAt mergedAt reviews(first:2){ totalCount nodes{ state commit{oid} } } } } }
}`;

// One review, it approved, and it was on the final commit (nothing pushed after it).
export const oneShot = (pr) => pr.reviews.totalCount === 1 && pr.reviews.nodes[0].state === "APPROVED" && pr.reviews.nodes[0].commit?.oid === pr.headRefOid;

// Start (local midnight) of the day that makes `days` working days counting back from `now`, today included.
export function workdaysSince(now, days) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  for (let n = 0; ; d.setDate(d.getDate() - 1)) if (d.getDay() % 6 && ++n === days) return d;
}

// "2y 3m" style length of time between two dates.
export function tenure(from, to) {
  const a = new Date(from), b = new Date(to);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate());
  if (months < 1) return `${Math.max(0, Math.floor((b - a) / 864e5))}d`;
  return [Math.floor(months / 12) && `${Math.floor(months / 12)}y`, months % 12 && `${months % 12}m`].filter(Boolean).join(" ");
}

// The last `n` Monday-start weeks of PRs merged to develop: count, first-try count, median days opened→merged.
export function weeks(prs, now, n = 6) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(monday); start.setDate(start.getDate() - 7 * (n - 1 - i));
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const inWeek = prs.filter((p) => new Date(p.mergedAt) >= start && new Date(p.mergedAt) < end);
    const days = inWeek.map((p) => (new Date(p.mergedAt) - new Date(p.createdAt)) / 864e5).sort((a, b) => a - b);
    const mid = days.length / 2;
    return { start: start.getTime(), merged: inWeek.length, first: inWeek.filter(oneShot).length,
      cycle: days.length ? (days.length % 2 ? days[mid - 0.5] : (days[mid - 1] + days[mid]) / 2) : null };
  });
}

// ponytail: org PRs, languages and every personal list cover the first 100 results; paginate if that's ever exceeded.
// `days`: 0 = overall, else the personal tiles count only the last `days` working days.
export function summarize(data, repo, org, days = 0, now = Date.now()) {
  const r = data.repository, o = data.organization.repositories;
  const langs = {};
  for (const n of o.nodes) if (n.primaryLanguage) langs[n.primaryLanguage.name] = (langs[n.primaryLanguage.name] || 0) + 1;
  return {
    repo, org, at: Date.now(),
    prs: r.pullRequests.totalCount, issues: r.issues.totalCount, stars: r.stargazerCount,
    me: data.viewer.login, meAvatar: data.viewer.avatarUrl, orgRepos: o.totalCount, orgLogo: data.organization.avatarUrl,
    orgPrs: o.nodes.reduce((s, n) => s + n.pullRequests.totalCount, 0),
    // Oldest first; `type` is the branch prefix (feat/…, fix/…).
    myOpen: data.myOpen.nodes.map((p) => ({ num: p.number, title: p.title, url: p.url, draft: p.isDraft, comments: p.comments.totalCount,
      type: p.headRefName.includes("/") ? p.headRefName.split("/")[0] : "", createdAt: p.createdAt })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    myMerged: data.myMerged.issueCount,
    myIssues: data.myIssues.nodes.map((i) => {
      const item = i.projectItems.nodes.find((n) => n.fieldValueByName?.name), v = item?.fieldValueByName;
      // Board column order; issues without a status go last.
      return { num: i.number, title: i.title, url: i.url, pr: i.closedByPullRequestsReferences?.nodes[0]?.number || 0, status: v?.name || "No status",
        // What setStatus needs; ponytail: issues with no status yet can't be moved, would need the project's Status field looked up.
        move: v ? { project: item.project.id, item: item.id, field: v.field.id, optionId: v.optionId, options: v.field.options } : null, rank: v ? v.field.options.findIndex((o) => o.id === v.optionId) : Infinity };
    }).sort((a, b) => a.rank - b.rank),
    myOneShot: data.myDevelop.nodes.filter(oneShot).length,
    myDevelopCount: data.myDevelop.nodes.length,
    weeks: weeks(data.myDevelop.nodes, now),
    // ponytail: GitHub only exposes org join dates to admins, so tenure starts at the first PR or issue you opened in the org.
    firstInOrg: data.myFirst.nodes[0]?.createdAt || null,
    window: days ? (() => {
      const since = workdaysSince(now, days), recent = (t) => new Date(t) >= since;
      return {
        days, since: since.getTime(),
        open: data.myOpen.nodes.filter((p) => recent(p.createdAt) && !p.isDraft).length,
        drafts: data.myOpen.nodes.filter((p) => recent(p.createdAt) && p.isDraft).length,
        merged: data.myMerged.issueCount,
        issues: data.myIssues.nodes.filter((i) => recent(i.createdAt)).length,
        oneShot: data.myDevelop.nodes.filter((p) => recent(p.mergedAt) && oneShot(p)).length,
        develop: data.myDevelop.nodes.filter((p) => recent(p.mergedAt)).length,
      };
    })() : null,
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

export async function fetchStats(token, repo, org, days = 0) {
  const [owner, name] = repo.split("/");
  const now = Date.now(), merged = days ? ` merged:>=${workdaysSince(now, days).toISOString()}` : "";
  return summarize(await gql(token, QUERY, { owner, name, org,
      qOpen: `repo:${repo} is:pr is:open author:@me`, qMerged: `repo:${repo} is:pr is:merged author:@me${merged}`,
      qIssues: `repo:${repo} is:issue is:open assignee:@me`, qDevelop: `repo:${repo} is:pr is:merged author:@me base:develop sort:updated-desc`,
      qFirst: `org:${org} author:@me sort:created-asc` }), repo, org, days, now);
}
