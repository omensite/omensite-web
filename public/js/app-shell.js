import { createNavigationController } from "./navigation-controller.js";
import { initializeJournalPage } from "./journal/journal-page-controller.js";
import { initializeIndicatorAccessPage } from "./indicators/indicator-access-controller.js";
import { initializeAdminPage } from "./admin/admin-controller.js";
import { HttpJournalRepository } from "./journal/http-journal-repository.js";
import { createJournalService } from "./journal/journal-service.js";
import { initializeMarketNewsPage } from "./market-news/market-news-controller.js";
import { initializeTraderPage } from "./trader/trader-controller.js";
import { initializeBrainPage } from "./brain/brain-controller.js";
import { startSphereRenderer } from "./sphere-renderer.js";
import { createTransitionController } from "./transition-controller.js";
import { createDrawerController, setActiveNavigation, startStatusUpdates } from "./ui-utils.js";
import { initializePageInteractions } from "./page-interactions.js";
import { initializeColorTheme } from "./redline-theme.js";

const shellInstances = new WeakMap();

function showTerminalToast(documentRef, message) {
  const toast = documentRef.querySelector("[data-toast]");
  if (!toast) return;
  toast.textContent = `[SYSTEM] ${message}`;
  toast.hidden = false;
  const previous = Number(toast.dataset.dismissTimer || 0);
  if (previous) documentRef.defaultView?.clearTimeout(previous);
  const timer = documentRef.defaultView?.setTimeout(() => {
    toast.hidden = true;
    toast.dataset.dismissTimer = "";
  }, 2400);
  if (timer) toast.dataset.dismissTimer = String(timer);
}

function hydrateJournalCount(root, service) {
  const count = root.querySelector("[data-journal-count]");
  if (!count) return;
  const update = (entries) => {
    const entryCount = entries.length;
    count.textContent = String(entryCount);
    count.classList.toggle("muted", entryCount === 0);
  };
  const entries = service.list();
  if (entries?.then) return entries.then(update);
  update(entries);
}

export function initializeAppShell({ documentRef = document, windowRef = window, fetchImpl = window.fetch.bind(window), initializePage = () => {}, journalService } = {}) {
  if (shellInstances.has(documentRef)) return shellInstances.get(documentRef);
  const stopTheme = initializeColorTheme({ documentRef, windowRef });
  const reducedMotion = Boolean(windowRef.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const transition = createTransitionController({ documentRef, reducedMotion });
  const drawer = createDrawerController({ documentRef });
  const stopSpheres = startSphereRenderer({ documentRef, windowRef, reducedMotion });
  const stopStatus = startStatusUpdates({ documentRef, windowRef });
  const csrfToken = documentRef.querySelector('meta[name="csrf-token"]')?.content ?? "";
  const service = journalService ?? createJournalService(new HttpJournalRepository(fetchImpl, csrfToken));
  const journalPageState = { newEntry: null, screenshotCount: 0 };
  let navigator;
  let disposeActiveRoute = () => {};
  const initializeShellPage = (root, route) => {
    disposeActiveRoute();
    disposeActiveRoute = () => {};
    setActiveNavigation(documentRef, route.key);
    drawer.close();
    const journalCount = hydrateJournalCount(root, service);
    journalCount?.catch?.(() => showTerminalToast(documentRef, "JOURNAL DATA UNAVAILABLE"));
    if (route.key.startsWith("journal")) {
      initializeJournalPage(root, { ...service, pageState: journalPageState, navigate: (path) => navigator.navigate(path) });
    }
    if (route.key === "market-news") {
      disposeActiveRoute = initializeMarketNewsPage(root, { fetchImpl, windowRef }).dispose;
    }
    if (route.key === "trader") {
      disposeActiveRoute = initializeTraderPage(root, {
        fetchImpl,
        showToast: (message) => showTerminalToast(documentRef, message),
      }).dispose;
    }
    if (route.key === "brain") {
      disposeActiveRoute = initializeBrainPage(root, { fetchImpl, windowRef }).dispose;
    }
    if (route.key === "indicators") {
      disposeActiveRoute = initializeIndicatorAccessPage(root, {
        fetchImpl,
        showToast: (message) => showTerminalToast(documentRef, message),
      }).dispose;
    }
    if (route.key === "admin") {
      disposeActiveRoute = initializeAdminPage(root, {
        fetchImpl,
        showToast: (message) => showTerminalToast(documentRef, message),
        windowRef,
      }).dispose;
    }
    initializePageInteractions(root, { showToast: (message) => showTerminalToast(documentRef, message) });
    initializePage(root, route);
  };
  navigator = createNavigationController({
    documentRef,
    windowRef,
    fetchImpl,
    transition,
    initializePage: initializeShellPage,
    showToast: (message) => showTerminalToast(documentRef, message),
  });
  const logoutButton = documentRef.querySelector("[data-logout]");
  let loggingOut = false;
  const logout = async () => {
    if (loggingOut) return;
    loggingOut = true;
    if (logoutButton) logoutButton.disabled = true;
    try {
      const response = await fetchImpl("/auth/logout", {
        method: "POST",
        headers: { Accept: "application/json", "X-CSRF-Token": csrfToken },
      });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.redirectTo !== "string") throw new Error("Logout request failed");
      windowRef.location.href = result.redirectTo;
    } catch {
      loggingOut = false;
      if (logoutButton) logoutButton.disabled = false;
      showTerminalToast(documentRef, "LOGOUT FAILED — CONNECTION RETAINED");
    }
  };
  logoutButton?.addEventListener("click", logout);
  const instance = {
    navigator,
    dispose() {
      disposeActiveRoute();
      navigator.dispose();
      drawer.dispose();
      stopSpheres();
      stopStatus();
      stopTheme();
      logoutButton?.removeEventListener("click", logout);
      shellInstances.delete(documentRef);
    },
  };
  shellInstances.set(documentRef, instance);
  const initialRoute = documentRef.querySelector("[data-route-view]");
  if (initialRoute) {
    const key = initialRoute.dataset.routeKey || "";
    setActiveNavigation(documentRef, key);
    initializeShellPage(initialRoute, {
      path: `${windowRef.location.pathname}${windowRef.location.search}`,
      title: documentRef.title.replace(/^OMENSITE ::\s*/, ""),
      key,
    });
  }
  return instance;
}

if (typeof document !== "undefined" && document.querySelector("[data-app-shell]")) initializeAppShell();
