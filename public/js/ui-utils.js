export function formatUptime(seconds) {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function startStatusUpdates({ documentRef, windowRef }) {
  let uptimeSeconds = 0;
  const tick = () => {
    uptimeSeconds += 1;
    const now = new Date();
    documentRef.querySelectorAll("[data-clock]").forEach((clock) => { clock.textContent = now.toTimeString().slice(0, 8); });
    documentRef.querySelectorAll("[data-uptime]").forEach((uptime) => { uptime.textContent = formatUptime(uptimeSeconds); });
    documentRef.querySelectorAll("[data-uptime-min]").forEach((uptime) => { uptime.textContent = `${Math.floor(uptimeSeconds / 60)}m`; });
  };
  tick();
  const interval = windowRef.setInterval(tick, 1000);
  return () => windowRef.clearInterval(interval);
}

export function createDrawerController({ documentRef }) {
  const body = () => documentRef.querySelector("[data-shell-body]");
  const toggleButton = () => documentRef.querySelector("[data-nav-toggle]");
  const setOpen = (open) => {
    body()?.classList.toggle("nav-open", open);
    toggleButton()?.setAttribute("aria-expanded", String(open));
  };
  const close = () => setOpen(false);
  const toggle = () => setOpen(!body()?.classList.contains("nav-open"));
  const onClick = (event) => {
    if (event.target.closest?.("[data-nav-toggle]")) toggle();
    if (event.target.closest?.("[data-nav-scrim]")) close();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
  };
  documentRef.addEventListener("click", onClick);
  documentRef.addEventListener("keydown", onKeyDown);
  return {
    close,
    toggle,
    dispose() {
      documentRef.removeEventListener("click", onClick);
      documentRef.removeEventListener("keydown", onKeyDown);
    },
  };
}

export function setActiveNavigation(documentRef, key) {
  documentRef.querySelectorAll("[data-nav-link]").forEach((link) => {
    const active = link.dataset.navKey === key || (link.dataset.navKey === "journal" && key.startsWith("journal"));
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}
