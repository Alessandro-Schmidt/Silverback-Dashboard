// Refreshes the stats every 15 minutes. The toolbar icon wears a mini crest in your tier colour, and the badge
// counts the PRs waiting on you (hidden at 0). Everything stays in chrome.storage.local, never synced:
// no server, nothing leaves the browser except the calls to GitHub.
import { fetchStats, sideEye, tier, validPeriod } from "./stats.js";

const SHIELD = new Path2D("M60 4 L110 18 V60 C110 96 88 122 60 134 C32 122 10 96 10 60 V18 Z");

// The gorilla disc with a small shield in the tier colour, bottom right (design board "Extension-Icon").
async function drawIcon(rate) {
  const t = tier(rate), imageData = {};
  for (const size of [16, 32]) {
    const c = new OffscreenCanvas(size, size), g = c.getContext("2d");
    const img = await createImageBitmap(await (await fetch(`icons/icon-${size}.png`)).blob());
    g.drawImage(img, 0, 0, size, size);
    if (t) {
      const w = size * 0.55, k = w / 120; // shield is 120 × 136 in its own units
      g.save();
      g.translate(size - w, size - 136 * k);
      g.scale(k, k);
      g.lineWidth = 16, g.strokeStyle = "#202124", g.stroke(SHIELD);
      g.fillStyle = t.c, g.fill(SHIELD);
      g.restore();
    }
    imageData[size] = g.getImageData(0, 0, size, size);
  }
  await chrome.action.setIcon({ imageData });
}

export async function refresh() {
  const { token, repo, org, period } = await chrome.storage.local.get(["token", "repo", "org", "period"]);
  if (!token || !repo) return chrome.action.setBadgeText({ text: "" });
  try {
    const stats = await fetchStats(token, repo, org, validPeriod(period));
    await chrome.storage.local.set({ stats, error: "" });
    const waiting = sideEye(stats).filter((x) => x.pr).length;
    await chrome.action.setBadgeBackgroundColor({ color: "#E6EDF3" });
    await chrome.action.setBadgeTextColor?.({ color: "#0D1117" });
    await chrome.action.setBadgeText({ text: waiting ? String(waiting) : "" });
    await chrome.action.setTitle({ title: `Silverback · ${stats.mine.rate == null ? "no merges yet" : `${stats.mine.rate}% ${tier(stats.mine.rate).name}`}${waiting ? ` · ${waiting} waiting on you` : ""}` });
    await drawIcon(stats.mine.rate);
  } catch (e) {
    await chrome.storage.local.set({ error: e.message }); // keep the last stats
    await chrome.action.setBadgeBackgroundColor({ color: "#D07A2A" });
    await chrome.action.setBadgeText({ text: "!" });
  }
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("refresh", { periodInMinutes: 15 }); refresh(); });
chrome.runtime.onStartup.addListener(refresh);
chrome.alarms.onAlarm.addListener((a) => a.name === "refresh" && refresh());
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg === "refresh") refresh().then(() => reply());
  return true; // reply comes later
});
