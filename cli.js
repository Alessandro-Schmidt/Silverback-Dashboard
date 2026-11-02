#!/usr/bin/env node
// Silverback from the terminal, and as an MCP server (`silverback mcp`) for AI clients. Same stats code as the app.
// Token: GITHUB_TOKEN (or GH_TOKEN). Every command prints JSON; move-issue, comment and request-review write to GitHub.
import { createInterface } from "node:readline";
import { fetchStats, fetchTeam, fetchMergedHistory, fetchDetail, listOrgs, listRepos, setStatus, sideEye, gql, PERIODS } from "./extension/lib/stats.js";

const token = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || fail("Set GITHUB_TOKEN (or GH_TOKEN) to a GitHub token.");
const fail = (msg) => { throw new Error(msg); };
const org = (a) => a.org || a.repo.split("/")[0];
const need = (a, ...keys) => { for (const k of keys) if (!a[k]) fail(`Missing ${k}.`); };
const str = (description) => ({ type: "string", description });
const REPO = str("owner/name, e.g. octo-org/app"), ORG = str("Organization login (default: the repo owner)");
const NUM = (what) => ({ type: "number", description: `${what} number` });
// GitHub's REST API, for the two writes GraphQL makes awkward (it wants node IDs).
async function rest(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, { method, body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`GitHub said ${res.status}: ${json.message || res.statusText}`);
  return json;
}
// Moves an issue to a Status column of the first project it's on, by column name (also when it has no status yet).
async function moveIssue(repo, n, status) {
  const [o, r] = repo.split("/");
  const d = await gql(token(), `query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issue(number:$n){ projectItems(first:10){ nodes{ id
    project{ id title field(name:"Status"){ ... on ProjectV2SingleSelectField{ id options{ id name } } } } } } } } }`, { o, r, n: Number(n) });
  const item = d.repository.issue?.projectItems.nodes.find((i) => i.project.field) || fail(`#${n} isn't on a project with a Status field.`);
  const { field } = item.project, opt = field.options.find((x) => x.name.toLowerCase() === status.toLowerCase())
    || fail(`No "${status}" column. Columns: ${field.options.map((x) => x.name).join(", ")}.`);
  await setStatus(token(), { project: item.project.id, item: item.id, field: field.id }, opt.id);
  return { issue: Number(n), project: item.project.title, status: opt.name };
}
const PERIOD = { type: "string", enum: Object.keys(PERIODS), description: `Period: ${Object.entries(PERIODS).map(([k, v]) => `${k} = ${v}`).join(", ")}. Default 0.` };

// One table drives both the CLI and the MCP tools.
const COMMANDS = {
  stats: { description: "Your stats for a repo: merged PRs, lines changed, open PRs, issues, Silverback rates and charts.",
    props: { repo: REPO, org: ORG, period: PERIOD }, required: ["repo"],
    run: (a) => fetchStats(token(), a.repo, org(a), a.period) },
  team: { description: "Team performance for a repo: Silverback rate, merges, cycle time, reviews, alerts and per-member rows.",
    props: { repo: REPO, org: ORG, period: PERIOD }, required: ["repo"],
    run: (a) => fetchTeam(token(), a.repo, org(a), a.period) },
  history: { description: "PRs merged into develop per month, over the repo's whole history.",
    props: { repo: REPO }, required: ["repo"],
    run: (a) => fetchMergedHistory(token(), a.repo).then((pts) => pts.map((b) => ({ month: new Date(b.start).toISOString().slice(0, 7), merged: b.merged }))) },
  pr: { description: "One pull request: status, size, reviews, requested reviewers, checks, linked issue.", props: { repo: REPO, number: NUM("PR") }, required: ["repo", "number"],
    run: (a) => fetchDetail(token(), a.repo, "pr", Number(a.number)) },
  issue: { description: "One issue with its timeline.", props: { repo: REPO, number: NUM("Issue") }, required: ["repo", "number"],
    run: (a) => fetchDetail(token(), a.repo, "issue", Number(a.number)) },
  orgs: { description: "Organizations the token can see.", props: {}, required: [], run: () => listOrgs(token()) },
  repos: { description: "Repositories of an organization, most recently pushed first.", props: { org: str("Organization login") }, required: ["org"],
    run: (a) => listRepos(token(), a.org) },
  "my-issues": { description: "Open issues assigned to you in a repo, with their board column, epic and sub-task progress, linked PR.",
    props: { repo: REPO }, required: ["repo"],
    run: async (a) => (await fetchStats(token(), a.repo, org(a))).myIssues.map(({ move, rank, ...i }) => i) },
  attention: { description: "What's waiting on you: stale drafts, PRs nobody reviewed yet, issues ready for dev.",
    props: { repo: REPO }, required: ["repo"],
    run: async (a) => sideEye(await fetchStats(token(), a.repo, org(a))).map(({ dot, metaColor, ...x }) => x) },
  "move-issue": { write: true, description: "Move an issue to another column (Status) of its project board, e.g. \"In progress\".",
    props: { repo: REPO, number: NUM("Issue"), status: str("Column name, case-insensitive") }, required: ["repo", "number", "status"],
    run: (a) => moveIssue(a.repo, a.number, a.status) },
  comment: { write: true, description: "Post a comment on an issue or pull request.",
    props: { repo: REPO, number: NUM("Issue or PR"), body: str("Comment text (Markdown)") }, required: ["repo", "number", "body"],
    run: async (a) => ({ url: (await rest("POST", `/repos/${a.repo}/issues/${a.number}/comments`, { body: a.body })).html_url }) },
  "request-review": { write: true, description: "Ask people to review a pull request.",
    props: { repo: REPO, number: NUM("PR"), reviewers: str("GitHub logins, comma-separated") }, required: ["repo", "number", "reviewers"],
    run: async (a) => ({ requested: (await rest("POST", `/repos/${a.repo}/pulls/${a.number}/requested_reviewers`,
      { reviewers: String(a.reviewers).split(",").map((x) => x.trim()).filter(Boolean) })).requested_reviewers.map((u) => u.login) }) },
};

// ---- MCP over stdio (JSON-RPC 2.0, one message per line) ----
function mcp() {
  const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  const tools = Object.entries(COMMANDS).map(([name, c]) => ({ name, description: c.description,
    inputSchema: { type: "object", properties: c.props, required: c.required }, annotations: { readOnlyHint: !c.write, destructiveHint: false } }));
  createInterface({ input: process.stdin }).on("line", async (line) => {
    let m;
    try { m = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: "Parse error" } }); }
    if (m.id === undefined) return; // notifications (initialized, cancelled) need no answer
    const ok = (result) => send({ id: m.id, result });
    if (m.method === "initialize") return ok({ protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "silverback", version: "1.0.0" } });
    if (m.method === "ping") return ok({});
    if (m.method === "tools/list") return ok({ tools });
    if (m.method === "tools/call") {
      const c = COMMANDS[m.params?.name];
      if (!c) return send({ id: m.id, error: { code: -32602, message: `Unknown tool ${m.params?.name}` } });
      try {
        const args = m.params.arguments || {};
        need(args, ...c.required);
        return ok({ content: [{ type: "text", text: JSON.stringify(await c.run(args), null, 2) }] });
      } catch (e) { return ok({ content: [{ type: "text", text: e.message }], isError: true }); }
    }
    send({ id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } });
  });
}

// ---- CLI: silverback <command> --repo owner/name [--org x] [--period 0] [--number 12] ----
const [cmd, ...argv] = process.argv.slice(2);
const usage = () => `Usage: silverback <command> [--repo owner/name] [--org login] [--period ${Object.keys(PERIODS).join("|")}] [--number n] [--status col] [--body text] [--reviewers a,b]
       silverback mcp   (MCP server on stdio)

${Object.entries(COMMANDS).map(([n, c]) => `  ${n.padEnd(15)} ${c.description}`).join("\n")}

Needs GITHUB_TOKEN (or GH_TOKEN) in the environment.`;

if (cmd === "mcp") mcp();
else if (!COMMANDS[cmd]) { console.log(usage()); process.exitCode = cmd && cmd !== "help" && cmd !== "--help" ? 1 : 0; }
else {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? "true" : argv[++i];
  try {
    need(args, ...COMMANDS[cmd].required);
    console.log(JSON.stringify(await COMMANDS[cmd].run(args), null, 2));
  } catch (e) { console.error(`silverback: ${e.message}`); process.exitCode = 1; }
}
