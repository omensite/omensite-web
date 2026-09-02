const FAILURE_MESSAGE = "ROUTE LOAD FAILED :: CURRENT BUFFER RETAINED";
const ROUTE_NOT_FOUND_MESSAGE = "ROUTE NOT FOUND :: CURRENT BUFFER RETAINED";
const SYSTEM_ERROR_MESSAGE = "SYSTEM ERROR :: RETRY ROUTE";

function reducedMotion(windowRef) {
  return Boolean(windowRef.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function wait(windowRef, milliseconds) {
  return new Promise((resolve) => windowRef.setTimeout(resolve, milliseconds));
}

function parseRoute(documentRef, html) {
  const template = documentRef.createElement("template");
  template.innerHTML = html;
  return template.content.querySelector("[data-route-view]");
}

function isInterceptableLink(event, anchor, windowRef) {
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (!anchor.matches("a[data-nav-link]") || anchor.hasAttribute("download") || anchor.hasAttribute("target")) return false;
  const url = new URL(anchor.href, windowRef.location.href);
  return url.origin === new URL(windowRef.location.href).origin && !url.hash;
}

export function createNavigationController({ documentRef, windowRef, fetchImpl, transition, initializePage, showToast = () => {} }) {
  let activeAbortController = null;
  let requestId = 0;
  let disposed = false;

  async function navigate(url, { history = "push", title: initialTitle = "ROUTING" } = {}) {
    const destination = new URL(url, windowRef.location.href);
    if (destination.origin !== new URL(windowRef.location.href).origin) {
      windowRef.location.assign(destination.href);
      return;
    }

    activeAbortController?.abort();
    const controller = new AbortController();
    activeAbortController = controller;
    const currentRequest = ++requestId;
    const useReducedMotion = reducedMotion(windowRef);
    const swapAfter = useReducedMotion ? 60 : 260;
    const hideAfter = useReducedMotion ? 120 : 640;
    const startedAt = Date.now();
    let toastMessage = SYSTEM_ERROR_MESSAGE;
    transition.show(initialTitle);

    try {
      const response = await fetchImpl(`${destination.pathname}${destination.search}`, {
        headers: { "X-Omensite-Fragment": "1" },
        signal: controller.signal,
      });

      if (currentRequest !== requestId || disposed) return;
      if (response.status === 401) {
        transition.hide();
        windowRef.location.assign("/login");
        return;
      }
      if (response.status === 404) toastMessage = ROUTE_NOT_FOUND_MESSAGE;
      if (!response.ok) throw new Error(`Fragment request failed with ${response.status}`);

      const routeView = parseRoute(documentRef, await response.text());
      if (!routeView) throw new Error("Fragment response does not contain [data-route-view]");
      if (currentRequest !== requestId || disposed) return;

      const path = response.headers.get("X-Omensite-Path") || `${destination.pathname}${destination.search}`;
      const title = response.headers.get("X-Omensite-Title") || initialTitle;
      const key = response.headers.get("X-Omensite-Key") || routeView.dataset.routeKey || "";
      if (typeof transition.setTitle === "function") transition.setTitle(title);
      else if (title !== initialTitle) transition.show(title);
      const elapsed = Date.now() - startedAt;
      if (elapsed < swapAfter) await wait(windowRef, swapAfter - elapsed);
      if (currentRequest !== requestId || disposed) return;

      const main = documentRef.querySelector("[data-main]");
      const previousRoute = main?.querySelector(":scope > [data-route-view]");
      if (previousRoute) previousRoute.replaceWith(routeView);
      else main?.prepend(routeView);
      if (main) main.scrollTop = 0;
      documentRef.title = `OMENSITE :: ${title}`;
      if (history === "push") windowRef.history.pushState({ omensitePath: path }, "", path);
      initializePage(routeView, { path, title, key });

      const remaining = Math.max(0, hideAfter - (Date.now() - startedAt));
      windowRef.setTimeout(() => {
        if (currentRequest === requestId && !disposed) transition.hide();
      }, remaining);
    } catch (error) {
      if (currentRequest !== requestId || disposed || error?.name === "AbortError") return;
      transition.fail(FAILURE_MESSAGE);
      showToast(toastMessage);
      windowRef.setTimeout(() => {
        if (currentRequest === requestId && !disposed) transition.hide();
      }, hideAfter);
    } finally {
      if (currentRequest === requestId) activeAbortController = null;
    }
  }

  function onDocumentClick(event) {
    const anchor = event.target.closest?.("a[data-nav-link]");
    if (!isInterceptableLink(event, anchor, windowRef)) return;
    event.preventDefault();
    navigate(anchor.href);
  }

  function onPopState() {
    navigate(`${windowRef.location.pathname}${windowRef.location.search}`, { history: "none" });
  }

  documentRef.addEventListener("click", onDocumentClick);
  windowRef.addEventListener("popstate", onPopState);

  function dispose() {
    disposed = true;
    activeAbortController?.abort();
    documentRef.removeEventListener("click", onDocumentClick);
    windowRef.removeEventListener("popstate", onPopState);
  }

  return { navigate, dispose };
}
