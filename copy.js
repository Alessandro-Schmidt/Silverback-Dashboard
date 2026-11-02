// A copy button on every .card: click puts a PNG of the card on the clipboard.
import { toBlob } from "html-to-image";

const icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const addButtons = () => {
  for (const card of document.querySelectorAll(".card:not(:has(> .copy))")) {
    card.insertAdjacentHTML("beforeend", `<button class="copy" type="button" title="Copy as image" aria-label="Copy as image">${icon}</button>`);
  }
};
new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true });
addButtons();

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy");
  if (!btn) return;
  e.stopPropagation();
  const card = btn.parentElement;
  try {
    // ClipboardItem accepts a promise, which keeps Safari's user-gesture check happy.
    const png = toBlob(card, { pixelRatio: 2, backgroundColor: getComputedStyle(card).backgroundColor, filter: (n) => !n.classList?.contains("copy") });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    btn.title = "Copied!", btn.classList.add("done");
  } catch (err) {
    btn.title = `Copy failed: ${err.message}`;
  }
  setTimeout(() => (btn.title = "Copy as image", btn.classList.remove("done")), 1500);
}, true);
