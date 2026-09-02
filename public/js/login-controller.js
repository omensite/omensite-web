import { runLoginSequence, AUTH_LINES } from "./login-sequence.js";
import { startMatrix } from "./matrix-renderer.js";
import { startSphereRenderer } from "./sphere-renderer.js";

const CREDENTIAL_ERROR = "> ERR :: CREDENTIALS REQUIRED — USER AND PASSKEY";
const REQUEST_ERROR = "> ERR :: LOGIN REQUEST FAILED — RETRY";

function replaceFormWithStream({ documentRef, form, root, reducedMotion, redirectTo, windowRef, stopSphere }) {
  const stream = documentRef.createElement("div");
  stream.className = "auth-stream";
  form.replaceWith(stream);
  let stopMatrix = () => {};

  return runLoginSequence({
    reducedMotion,
    onLine(line) {
      const entry = documentRef.createElement("div");
      entry.textContent = line;
      stream.appendChild(entry);
      if (line === AUTH_LINES.at(-1)) {
        for (const message of ["> decrypting interface", "> mounting data streams"]) {
          const progress = documentRef.createElement("div");
          progress.textContent = message;
          stream.appendChild(progress);
        }
      }
    },
    onGrant() {
      stopSphere();
      const screen = documentRef.createElement("div");
      screen.className = "screen";
      if (reducedMotion) {
        screen.style.background = "var(--c-bg-deep)";
      } else {
        const canvas = documentRef.createElement("canvas");
        canvas.className = "matrix-canvas";
        screen.appendChild(canvas);
        stopMatrix = startMatrix(canvas);
      }
      const granted = documentRef.createElement("div");
      granted.className = "auth-granted";
      granted.style.cssText = "position: fixed; inset: 0; z-index: 9600";
      const label = documentRef.createElement("span");
      label.textContent = "ACCESS GRANTED";
      granted.appendChild(label);
      root.replaceChildren(screen, granted);
    },
    onComplete() {
      stopMatrix();
      windowRef.location.href = redirectTo;
    },
  });
}

export function initializeLoginController({
  documentRef = document,
  windowRef = window,
  fetchImpl = window.fetch.bind(window),
} = {}) {
  const form = documentRef.querySelector("[data-login-form]");
  if (!form) return null;

  const root = documentRef.querySelector("[data-login-root]");
  const card = form.closest(".login-card");
  const error = form.querySelector("[data-login-error]");
  const submit = form.querySelector("[data-login-submit]");
  const user = form.querySelector("[data-login-user]");
  const passkey = form.querySelector("[data-login-passkey]");
  const reducedMotion = Boolean(windowRef.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  let stopSphere = startSphereRenderer({ documentRef, windowRef, reducedMotion });
  const stopLoginSphere = () => {
    stopSphere();
    stopSphere = () => {};
  };
  let submitting = false;

  const showError = (message, shake = false) => {
    error.textContent = message;
    error.hidden = false;
    if (!shake || !card) return;
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    windowRef.setTimeout(() => card.classList.remove("shake"), 420);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    submit.disabled = true;
    error.hidden = true;

    try {
      const response = await fetchImpl("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ username: user.value, passkey: passkey.value }),
      });
      if (response.status === 400) {
        showError(CREDENTIAL_ERROR, true);
        return;
      }
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.redirectTo !== "string") throw new Error("Login request failed");
      await replaceFormWithStream({ documentRef, form, root, reducedMotion, redirectTo: result.redirectTo, windowRef, stopSphere: stopLoginSphere });
    } catch {
      showError(REQUEST_ERROR);
    } finally {
      if (documentRef.contains(form)) {
        submitting = false;
        submit.disabled = false;
      }
    }
  };

  form.addEventListener("submit", onSubmit);
  return {
    dispose() {
      form.removeEventListener("submit", onSubmit);
      stopLoginSphere();
    },
  };
}

if (typeof document !== "undefined" && document.querySelector("[data-login-form]")) initializeLoginController();
