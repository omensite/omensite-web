const initializedRoots = new WeakSet();

export function initializePageInteractions(root, { showToast = () => {} } = {}) {
  if (!root || initializedRoots.has(root)) return;
  initializedRoots.add(root);
  const filters = root.querySelectorAll("[data-news-filter]");
  filters.forEach((button, index) => {
    button.classList.toggle("active", index === 0);
    button.setAttribute("aria-pressed", String(index === 0));
  });
  root.addEventListener("click", async (event) => {
    const target = event.target.closest?.("[data-news-filter], [data-alert-standby], [data-copy-target]");
    if (!target || !root.contains(target)) return;
    if (target.dataset.newsFilter) {
      filters.forEach((button) => {
        const active = button === target;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      return;
    }
    if (target.hasAttribute("data-alert-standby")) return showToast("ALERT ENGINE :: STANDBY :: MODULE PENDING");
    const text = root.querySelector(target.dataset.copyTarget)?.textContent?.trim() ?? "";
    try { await root.ownerDocument.defaultView?.navigator.clipboard?.writeText(text); } catch { /* optional permission */ }
    showToast(target.dataset.copyMessage || "COPIED");
  });
}
