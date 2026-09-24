const preferenceKey = "omensite-theme";
const themes = new Set(["core", "daylight"]);

/** Theme preferences contain no account or trading data. Storage may be unavailable. */
export function initializeColorTheme({ documentRef = document, windowRef = window } = {}) {
  const controls = [...documentRef.querySelectorAll("[data-color-theme]")];
  const ThemeEvent = documentRef.defaultView?.Event ?? windowRef.Event;
  function apply(theme) {
    documentRef.documentElement.dataset.theme = themes.has(theme) ? theme : "core";
    for (const button of controls) button.setAttribute("aria-pressed", String(button.dataset.colorTheme === documentRef.documentElement.dataset.theme));
    documentRef.dispatchEvent(new ThemeEvent("omensite:themechange"));
  }
  let stored;
  try { stored = windowRef.localStorage?.getItem(preferenceKey); } catch { /* Private browsing still supports an in-memory theme. */ }
  apply(stored);
  const select = (event) => {
    const theme = event.currentTarget.dataset.colorTheme;
    apply(theme);
    try { windowRef.localStorage?.setItem(preferenceKey, theme); } catch { /* Selection still applies for this document. */ }
  };
  controls.forEach((button) => button.addEventListener("click", select));
  return () => controls.forEach((button) => button.removeEventListener("click", select));
}
