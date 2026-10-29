// Refreshes the stats every 30 minutes and keeps the toolbar badge on your open (non-draft) PR count.
// Everything stays in chrome.storage.local: no server, nothing leaves the browser except the calls to GitHub.
import { fetchStats } from "./stats.js";

export async function refresh() {
  const { token, repo, org, period = "30" } = await chrome.storage.local.get(["token", "repo", "org", "period"]);
  if (!token || !repo) return chrome.action.setBadgeText({ text: "" });
  try {
    const stats = await fetchStats(token, repo, org, period);
    await chrome.storage.local.set({ stats, error: "" });
    const open = stats.myOpen.filter((p) => !p.draft).length;
    await chrome.action.setBadgeBackgroundColor({ color: "#4C8DFF" });
    await chrome.action.setBadgeText({ text: open ? String(open) : "" });
  } catch (e) {
    await chrome.storage.local.set({ error: e.message }); // keep the last stats
    await chrome.action.setBadgeBackgroundColor({ color: "#D07A2A" });
    await chrome.action.setBadgeText({ text: "!" });
  }
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("refresh", { periodInMinutes: 30 }));
chrome.runtime.onStartup.addListener(refresh);
chrome.alarms.onAlarm.addListener((a) => a.name === "refresh" && refresh());
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg === "refresh") refresh().then(() => reply());
  return true; // reply comes later
});
