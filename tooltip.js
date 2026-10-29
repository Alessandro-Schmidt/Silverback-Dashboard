// One page-level tooltip for every chart: it shows the hovered (or focused) mark's .tip or data-tip in full and
// follows the mouse, so a card edge can never cut it.
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const tooltip = document.body.appendChild(Object.assign(document.createElement("div"), { id: "tooltip", role: "tooltip" }));
const tipOf = (el) => el?.closest?.("[data-tip], .bar, .hrow");
const tipHtml = (el) => el.dataset.tip ? esc(el.dataset.tip) : el.querySelector(":scope > .tip")?.innerHTML;
function placeTip(x, y) {
  const r = tooltip.getBoundingClientRect(), pad = 14;
  tooltip.style.left = `${Math.min(x + pad, innerWidth - r.width - 8)}px`;
  tooltip.style.top = `${y + pad + r.height > innerHeight ? y - r.height - pad : y + pad}px`;
}
function showTip(el, x, y) {
  const html = el && tipHtml(el);
  if (!html) return (tooltip.hidden = true);
  tooltip.innerHTML = html, tooltip.hidden = false;
  placeTip(x, y);
}
tooltip.hidden = true;
document.addEventListener("mousemove", (e) => { const el = tipOf(e.target); el ? showTip(el, e.clientX, e.clientY) : (tooltip.hidden = true); });
document.addEventListener("focusin", (e) => { const el = tipOf(e.target); if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); } });
document.addEventListener("focusout", () => (tooltip.hidden = true));
document.addEventListener("scroll", () => (tooltip.hidden = true), true);
