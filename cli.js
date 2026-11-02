#!/usr/bin/env node
// Silverback from the terminal, and as an MCP server (`silverback mcp`) for AI clients. Same stats code as the app.
// Token: GITHUB_TOKEN (or GH_TOKEN). Every command is read-only and prints JSON.
import { createInterface } from "node:readline";
import { fetchStats, fetchTeam, fetchMergedHistory, fetchDetail, listOrgs, listRepos, PERIODS } from "./extension/lib/stats.js";

const token = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || fail("Set GITHUB_TOKEN (or GH_TOKEN) to a GitHub token.");
const fail = (msg) => { throw new Error(msg); };
const org = (a) => a.org || a.repo.split("/")[0];
const need = (a, ...keys) => { for (const k of keys) if (!a[k]) fail(`Missing ${k}.`); };
const str = (description) => ({ type: "string", description });
const REPO = str("owner/name, e.g. octo-org/app"), ORG = str("Organization login (default: the repo owner)");
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
  pr: { description: "One pull request: status, size, reviews, requested reviewers, checks, linked issue.", props: { repo: REPO, number: { type: "number", description: "PR number" } }, required: ["repo", "number"],
    run: (a) => fetchDetail(token(), a.repo, "pr", Number(a.number)) },
  issue: { description: "One issue with its timeline.", props: { repo: REPO, number: { type: "number", description: "Issue number" } }, required: ["repo", "number"],
    run: (a) => fetchDetail(token(), a.repo, "issue", Number(a.number)) },
  orgs: { description: "Organizations the token can see.", props: {}, required: [], run: () => listOrgs(token()) },
  repos: { description: "Repositories of an organization, most recently pushed first.", props: { org: str("Organization login") }, required: ["org"],
    run: (a) => listRepos(token(), a.org) },
};

// ---- MCP over stdio (JSON-RPC 2.0, one message per line) ----
function mcp() {
  const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  const tools = Object.entries(COMMANDS).map(([name, c]) => ({ name, description: c.description,
    inputSchema: { type: "object", properties: c.props, required: c.required }, annotations: { readOnlyHint: true } }));
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
const [cmd, ...rest] = process.argv.slice(2);
const usage = () => `Usage: silverback <command> [--repo owner/name] [--org login] [--period ${Object.keys(PERIODS).join("|")}] [--number n]
       silverback mcp   (MCP server on stdio)

${Object.entries(COMMANDS).map(([n, c]) => `  ${n.padEnd(8)} ${c.description}`).join("\n")}

Needs GITHUB_TOKEN (or GH_TOKEN) in the environment.`;

if (cmd === "mcp") mcp();
else if (!COMMANDS[cmd]) { console.log(usage()); process.exitCode = cmd && cmd !== "help" && cmd !== "--help" ? 1 : 0; }
else {
  const args = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) args[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") ? "true" : rest[++i];
  try {
    need(args, ...COMMANDS[cmd].required);
    console.log(JSON.stringify(await COMMANDS[cmd].run(args), null, 2));
  } catch (e) { console.error(`silverback: ${e.message}`); process.exitCode = 1; }
}
