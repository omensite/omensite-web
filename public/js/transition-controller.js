const OVERLAY_SELECTOR = ".route-xn";

function createOverlay(documentRef, title) {
  const overlay = documentRef.createElement("div");
  overlay.className = "route-xn";
  overlay.setAttribute("aria-hidden", "true");
  const glitchOne = documentRef.createElement("div");
  glitchOne.className = "route-xn-glitch route-xn-g1";
  const glitchTwo = documentRef.createElement("div");
  glitchTwo.className = "route-xn-glitch route-xn-g2";
  const center = documentRef.createElement("div");
  center.className = "route-xn-center";
  const titleNode = documentRef.createElement("div");
  titleNode.className = "route-xn-title";
  titleNode.textContent = `> ROUTING::${title}`;
  const buffer = documentRef.createElement("div");
  buffer.className = "route-xn-buffer";
  buffer.append("BUFFER ");
  const bar = documentRef.createElement("span");
  bar.className = "route-xn-bar";
  bar.append(documentRef.createElement("span"));
  buffer.append(bar);
  center.append(titleNode, buffer);
  overlay.append(glitchOne, glitchTwo, center);
  return overlay;
}

export function createTransitionController({ documentRef, reducedMotion = false }) {
  let overlay = null;

  function hide() {
    const main = documentRef.querySelector("[data-main]");
    overlay?.remove();
    main?.querySelectorAll(OVERLAY_SELECTOR).forEach((node) => node.remove());
    overlay = null;
  }

  function show(title) {
    const main = documentRef.querySelector("[data-main]");
    if (!main) return;
    hide();
    overlay = createOverlay(documentRef, title);
    if (reducedMotion) overlay.dataset.reducedMotion = "true";
    main.append(overlay);
  }

  function setTitle(title) {
    const titleNode = overlay?.querySelector(".route-xn-title");
    if (titleNode) titleNode.textContent = `> ROUTING::${title}`;
  }

  function fail(message) {
    const title = overlay?.querySelector(".route-xn-title");
    if (!title) return;
    title.textContent = `> ${message}`;
  }

  return { show, setTitle, hide, fail };
}
