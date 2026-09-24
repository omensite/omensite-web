import { createBrainNetworkRenderer } from "./brain-network-renderer.js";

const ROLES = [
  { id: "planner", name: "PLANNER", region: "frontal-l", description: "Decomposes the objective into a bounded research plan.", position: [-.64, -.49, .12] },
  { id: "researcher", name: "RESEARCHER", region: "frontal-r", description: "Retrieves context, sources and saved evidence through allowed tools.", position: [.61, -.46, -.08] },
  { id: "strategist", name: "STRATEGIST", region: "temporal-l", description: "Builds a structured proposal from observed evidence and risk checks.", position: [.62, .43, .12] },
  { id: "critic", name: "CRITIC", region: "temporal-r", description: "Reviews the proposal and can request a revision before human review.", position: [-.63, .43, -.1] },
];
const MODULES = [
  { id: "risk", name: "RISK", region: "parietal", detail: "Checks thesis sizing and configured risk limits. Broker requests still require their own preview and human approval.", panel: "checks" },
  { id: "retrieval", name: "RETRIEVAL", region: "occipital", detail: "Finds relevant excerpts from your saved knowledge, approved memories and available journal entries.", panel: "knowledge" },
  { id: "memory", name: "MEMORY", region: "cerebellum", detail: "Stores research accepted during human review. Saved memories become evidence for future missions, never standing trade permissions.", panel: "knowledge" },
  { id: "robinhood", name: "ROBINHOOD", region: "stem", detail: "Connects broker research, order previews and a separate approval queue for stocks, options and crypto.", panel: "robinhood" },
];
const TOOL_ROLES = { "context.read": "researcher", "knowledge.search": "researcher", "memory.search": "researcher", "journal.search": "researcher", "calendar.read": "researcher", "risk.check": "strategist" };
const TOOL_POSITIONS = [[-.22, -.73, .18], [.25, -.75, -.12], [.85, -.04, -.16], [.29, .73, -.14], [-.26, .74, .12], [-.88, -.04, .03]];
const FILTERS = [["all", "All"], ["agent", "Agents"], ["tool", "Tools"], ["memory", "Memory"]];
const active = (value) => ["running", "active", "in_progress"].includes(value);
const safeArray = (value) => Array.isArray(value) ? value : [];
const label = (value) => String(value ?? "").replaceAll("_", " ");
const number = (value) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";

/** A read-only projection of saved application state. Decorative particles are not data nodes. */
export function buildBrainNetworkData(state = {}) {
  const providers = safeArray(state.providers), runs = safeArray(state.runs), documents = safeArray(state.documents);
  const run = state.selectedRun ?? runs[0] ?? null;
  const toolDefinitions = safeArray(state.toolDefinitions);
  const tools = [...new Map(toolDefinitions.filter((tool) => typeof tool?.name === "string").map((tool) => [tool.name, tool])).values()];
  const nodes = [{ id: "omen", kind: "core", name: "OMEN", detail: "Agent orchestration", position: [0, 0, 0], status: active(run?.status) ? "running" : "idle" }];
  for (const role of ROLES) {
    const graph = safeArray(run?.graph?.nodes).filter((node) => node.role === role.id);
    const providerId = run?.input?.routes?.[role.id] || run?.input?.provider || state.defaultProvider;
    const provider = providers.find((entry) => entry.id === providerId);
    let status = graph.find((node) => active(node.status))?.status ?? graph.at(-1)?.status ?? "idle";
    // The planner creates the three-node graph; it is not itself a graph node.
    // Its validated plan and trace are the recorded completion evidence.
    if (role.id === "planner" && !graph.length) {
      const events = safeArray(run?.trace).filter((event) => event.agent === "planner");
      if (safeArray(run?.plan).length || events.some((event) => event.type === "plan")) status = "complete";
      else if (events.some((event) => event.type === "step")) status = active(run?.status) ? "running" : run?.status ?? "idle";
    }
    if (active(status) && ["failed", "cancelled"].includes(run?.status)) status = run.status;
    nodes.push({ ...role, id: `agent:${role.id}`, role: role.id, kind: "agent", status, parent: "omen", detail: role.description,
      provider: run?.input?.mode === "demo" ? "Offline demo · no model calls" : provider ? `${provider.label ?? provider.id}${provider.model ? ` / ${provider.model}` : " · Not configured"}${run ? "" : " · default route"}` : "Assigned when a mission starts", panel: "mission" });
  }
  for (const module of MODULES) nodes.push({ ...module, id: `module:${module.id}`, kind: "module", parent: "omen", position: [0, 0, 0], status: module.id === "robinhood" ? !state.brokerState ? "not checked" : state.brokerState.connected === true ? "connected" : "not connected" : "available" });
  tools.slice(0, 12).forEach((tool, index) => {
    const events = safeArray(run?.trace).filter((event) => event.details?.tool === tool.name);
    const observedRole = events.findLast((event) => ROLES.some((role) => role.id === event.agent))?.agent;
    const slot = TOOL_POSITIONS[index % TOOL_POSITIONS.length];
    nodes.push({ id: `tool:${tool.name}`, name: tool.name, kind: "tool", detail: tool.description || "Registered, permission-scoped research tool.",
      status: events.length ? "observed" : "available", observations: events.length, parent: `agent:${observedRole ?? TOOL_ROLES[tool.name] ?? "researcher"}`,
      position: [slot[0] * (index < 6 ? 1 : .77), slot[1] * (index < 6 ? 1 : .77), slot[2]], panel: "mission" });
  });
  documents.slice(0, 6).forEach((document, index) => {
    const angle = index * Math.PI / 3 + .28;
    nodes.push({ id: `document:${document.id}`, name: document.title || "Untitled source", kind: "memory", subtype: document.kind === "memory" ? "Approved memory" : "Knowledge source",
      detail: `${document.kind === "memory" ? "Saved after human review" : "Available to source retrieval"}. ${number(document.characters)} characters.`,
      status: "saved", parent: `tool:${document.kind === "memory" ? "memory.search" : "knowledge.search"}`,
      position: [Math.cos(angle) * .42, Math.sin(angle) * .52, -.26], panel: "knowledge" });
  });
  if (run) nodes.push({ id: `run:${run.id}`, name: `${run.input?.symbol || "CURRENT"} MISSION`, kind: "run", status: run.status, detail: run.input?.objective || "Inspect the saved mission, proposal and human review checkpoint.", position: [0, .48, .4], parent: "omen", panel: "mission" });
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) if (node.parent && !ids.has(node.parent)) node.parent = "agent:researcher";
  return { nodes, run, runs, providers, brokerState: state.brokerState, counts: { agents: ROLES.length, tools: tools.length, documents: documents.length, memories: documents.filter((document) => document.kind === "memory").length, runs: runs.length }, paidCallsEnabled: state.paidCallsEnabled === true };
}

export function createBrainNetwork(host, { onNavigate = () => {} } = {}) {
  if (!host?.ownerDocument) return { update() {}, refresh() {}, dispose() {} };
  const document = host.ownerDocument, window = document.defaultView;
  const el = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
  const button = (text, className, ariaLabel) => { const item = el("button", text, className); item.type = "button"; if (ariaLabel) item.setAttribute("aria-label", ariaLabel); return item; };
  let data = buildBrainNetworkData(), selectedId = "omen", filter = "all", zoom = 1, yaw = -.6, pitch = .22;
  let rotation = 0, exploded = 0, explosionFrom = 0, explosionTarget = 0, explosionStart = 0, assemblyStart = null;
  let disposed = false, frame = null, lastPaint = null, lastFrameTime = null, sceneTime = 0, width = 680, height = 540, drag = null, hasCanvas = false, intersecting = true;
  const motionQuery = window?.matchMedia?.("(prefers-reduced-motion: reduce)");
  let paused = Boolean(motionQuery?.matches);
  const listeners = [], nodeButtons = new Map(), lobeButtons = new Map();
  const listen = (target, event, handler, options) => { target?.addEventListener?.(event, handler, options); listeners.push(() => target?.removeEventListener?.(event, handler, options)); };
  const shell = el("section", undefined, "brain-network-shell"); shell.setAttribute("aria-label", "Agent network explorer");
  const toolbar = el("div", undefined, "brain-network-toolbar");
  const filters = el("div", undefined, "brain-network-filters"); filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "Filter network nodes");
  for (const [id, name] of FILTERS) { const item = button(name); item.dataset.networkFilter = id; item.setAttribute("aria-pressed", String(id === filter)); filters.append(item); }
  const lock = el("span", "PAID CALLS LOCKED", "brain-network-lock");
  const networkTitle = el("div", undefined, "brain-network-title"); networkTitle.append(el("span", "01 / CORTEX", "brain-network-eyebrow"), el("h2", "NEURAL MATRIX"));
  toolbar.append(networkTitle, lock);
  const workspace = el("div", undefined, "brain-network-workspace");
  const roster = el("aside", undefined, "brain-network-roster"); roster.setAttribute("aria-label", "Agents and support modules");
  const rosterHeading = el("div", undefined, "brain-network-section-heading"); rosterHeading.append(el("h3", "AGENT ROSTER"), el("span", "04 ROLES"));
  const nodeList = el("div", undefined, "brain-network-node-list");
  roster.append(rosterHeading, filters, nodeList);
  const stage = el("div", undefined, "brain-network-stage"); stage.setAttribute("aria-label", "Interactive agent topology");
  const canvas = el("canvas", undefined, "brain-network-canvas"); canvas.setAttribute("aria-hidden", "true");
  let context = null;
  // jsdom deliberately has no canvas implementation. Accessible node controls remain usable.
  if (typeof window?.CanvasRenderingContext2D === "function") { try { context = canvas.getContext("2d", { alpha: true }); } catch { /* DOM controls are the fallback. */ } }
  hasCanvas = Boolean(context);
  function palette() { const theme = window?.getComputedStyle?.(host); return { red: theme?.getPropertyValue("--red").trim(), glow: theme?.getPropertyValue("--red-glow").trim(), line: theme?.getPropertyValue("--line-strong").trim(), mono: theme?.getPropertyValue("--font-mono").trim(), dark: document.documentElement.dataset.theme !== "daylight" }; }
  let canvasColors = palette();
  const renderCanvas = context ? createBrainNetworkRenderer(context, canvasColors) : null;
  const grid = el("div", undefined, "brain-network-grid"); grid.setAttribute("aria-hidden", "true");
  const halo = el("div", undefined, "brain-network-halo"); halo.setAttribute("aria-hidden", "true");
  const labels = el("div", undefined, "brain-network-labels");
  const coordinate = el("span", "NEURAL MATRIX / ASSEMBLED", "brain-network-coordinate");
  const mode = el("span", "IDLE / OFFLINE READY", "brain-network-mode");
  const controls = el("div", undefined, "brain-network-controls"); controls.setAttribute("role", "group"); controls.setAttribute("aria-label", "Network view controls");
  const zoomOut = button("−", undefined, "Zoom out"), zoomIn = button("+", undefined, "Zoom in"), reset = button("↺", undefined, "Reset network view"), motion = button(paused ? "▷" : "Ⅱ", undefined, "Pause network motion");
  const disassemble = button("DISASSEMBLE", "brain-network-disassemble"), reassemble = button("REFORM", "brain-network-reassemble", "Reassemble brain particles"); disassemble.setAttribute("aria-pressed", "false");
  const zoomLabel = el("output", "100%", "brain-network-zoom"); zoomLabel.setAttribute("aria-label", "Network zoom");
  controls.append(disassemble, reassemble, zoomOut, zoomLabel, zoomIn, reset, motion);
  const hint = el("span", "DRAG TO ROTATE · SELECT A LOBE", "brain-network-hint");
  const decorationNote = el("span", "DECORATIVE NEURAL MOTION · ZERO AI TOKENS", "brain-network-decoration-note");
  stage.append(grid, halo, canvas, labels, coordinate, mode, controls, hint, decorationNote);
  stage.tabIndex = 0; stage.setAttribute("aria-label", "Binary brain. Arrow keys rotate; E disassembles; plus and minus zoom.");
  const rail = el("aside", undefined, "brain-network-rail");
  const inspector = el("div", undefined, "brain-network-inspector"); inspector.setAttribute("aria-live", "polite");
  const activity = el("div", undefined, "brain-network-activity");
  rail.append(inspector, activity); workspace.append(roster, stage, rail);
  const footer = el("div", undefined, "brain-network-footer");
  const telemetry = el("section", undefined, "brain-network-telemetry"); telemetry.setAttribute("aria-label", "Recorded mission metrics");
  const history = el("section", undefined, "brain-network-recent"); history.setAttribute("aria-label", "Recent mission history");
  shell.append(toolbar, workspace, footer, telemetry, history); host.replaceChildren(shell);

  function visible(node) { return node.kind === "core" || filter === "all" || node.kind === filter; }
  function project(position) {
    const [x, y, z] = position, rx = x * Math.cos(yaw) - z * Math.sin(yaw), rz = x * Math.sin(yaw) + z * Math.cos(yaw);
    const ry = y * Math.cos(pitch) - rz * Math.sin(pitch), depth = y * Math.sin(pitch) + rz * Math.cos(pitch);
    const perspective = 1 / (1.2 - depth * .13);
    const scale = Math.min(width * .51, height * .64) * zoom;
    return { x: width / 2 + rx * scale * perspective, y: height * .48 + ry * scale * perspective, depth };
  }
  function renderInspector() {
    const focusedNavigation = inspector.contains(document.activeElement) ? document.activeElement.dataset.networkNavigate : null;
    const node = data.nodes.find((item) => item.id === selectedId) ?? data.nodes[0]; selectedId = node.id;
    const category = node.kind === "core" ? "SYSTEM CORE" : node.kind === "agent" ? "AGENT ROLE" : node.kind === "module" ? "SUPPORT MODULE" : node.kind === "tool" ? "REGISTERED TOOL" : node.subtype ?? "SAVED MISSION";
    const status = el("span", label(node.status).toUpperCase(), "brain-network-state"); status.dataset.active = String(active(node.status));
    const badge = el("div", undefined, "brain-network-inspector-meta"); badge.append(el("span", category), status);
    inspector.replaceChildren(badge, el("span", node.kind === "agent" ? `0${ROLES.findIndex((role) => role.id === node.role) + 1}` : "[ + ]", "brain-network-inspector-symbol"), el("h3", node.name), el("p", node.kind === "core" ? "Four agents. One reviewable workflow. Research, challenge and verify a thesis before you decide what happens next." : node.detail));
    if (node.kind === "core") {
      const stats = el("dl", undefined, "brain-network-stats");
      for (const [name, value] of [["Agent roles", data.counts.agents], ["Available tools", data.counts.tools], ["Saved sources", data.counts.documents], ["Saved missions", data.counts.runs]]) { const row = el("div"); row.append(el("dt", name), el("dd", number(value))); stats.append(row); }
      inspector.append(stats);
      inspector.append(el("p", data.paidCallsEnabled ? "Provider access enabled on server." : "Paid provider calls are locked. Exploring this network uses no AI tokens.", "brain-network-inspector-note"));
    }
    if (node.provider) inspector.append(el("p", node.provider, "brain-network-inspector-note"));
    if (node.kind === "agent") {
      const events = safeArray(data.run?.trace).filter((event) => event.agent === node.role);
      const details = el("dl", undefined, "brain-network-stats");
      for (const [name, value] of [["Recorded events", events.length], ["Recorded tool events", events.filter((event) => event.details?.tool).length]]) { const row = el("div"); row.append(el("dt", name), el("dd", number(value))); details.append(row); }
      inspector.append(details, el("p", events.at(-1)?.summary || "No recorded activity for this role in the selected mission.", "brain-network-inspector-note"));
    }
    if (node.kind === "module" && node.id === "module:robinhood") inspector.append(el("p", !data.brokerState ? "Open Robinhood to check connection and submission controls." : data.brokerState.liveEnabled === true ? data.brokerState.paused ? "Broker submissions paused. Every action requires separate review." : "Submissions enabled on the server. Every action requires separate review." : "Live submissions disabled. Open Robinhood for connection and approval details.", "brain-network-inspector-note"));
    if (node.kind === "tool") inspector.append(el("p", `${node.observations} matching trace events in the selected mission.`, "brain-network-inspector-note"));
    const actionLabel = node.panel === "robinhood" ? "OPEN ROBINHOOD ↗" : node.panel === "knowledge" ? "OPEN MEMORY ↗" : node.panel === "checks" ? "OPEN CHECKS ↗" : "VIEW MISSION ↗";
    const navigate = button(actionLabel, "brain-network-open"); navigate.dataset.networkNavigate = node.panel ?? "mission"; inspector.append(navigate);
    if (node.kind === "core") { const checks = button("SETUP CHECKS ↗", "brain-network-open brain-network-open-secondary"); checks.dataset.networkNavigate = "checks"; inspector.append(checks); }
    for (const [id, item] of nodeButtons) item.setAttribute("aria-pressed", String(id === selectedId));
    for (const [id, item] of lobeButtons) item.setAttribute("aria-pressed", String(id === selectedId));
    if (focusedNavigation) [...inspector.querySelectorAll("[data-network-navigate]")].find((item) => item.dataset.networkNavigate === focusedNavigation)?.focus({ preventScroll: true });
  }
  function renderActivity() {
    const run = data.run, header = el("div", undefined, "brain-network-activity-heading"); header.append(el("h4", "ACTIVITY LOG"), el("span", run ? "SAVED TRACE" : "NO MISSION"));
    const list = el("ol");
    const events = safeArray(run?.trace).slice(-4).reverse();
    for (const event of events) {
      const item = el("li"), when = new Date(event.at), at = Number.isNaN(when.getTime()) ? "—" : when.toLocaleTimeString([], { hour12: false });
      const row = el("div", undefined, "brain-network-event-meta"); row.append(el("time", at), el("span", label(event.agent || event.type)));
      item.append(row, el("p", event.summary ?? "Saved event")); list.append(item);
    }
    activity.replaceChildren(header);
    if (run) {
      const mission = el("div", undefined, "brain-network-current-mission"); mission.append(el("strong", `${run.input?.symbol ?? "RESEARCH"} / ${run.input?.mode === "demo" ? "OFFLINE DEMO" : "ANALYSIS"}`), el("span", label(run.status).toUpperCase())); activity.append(mission);
    }
    if (events.length) activity.append(list);
    else activity.append(el("p", run ? "No trace events have been recorded for this mission." : "No mission activity yet. Run an offline demo to see the workflow here.", "brain-network-empty"));
  }
  function renderTelemetry() {
    const metrics = data.run?.metrics, recorded = (value) => metrics ? number(value ?? 0) : "—";
    const cost = !metrics || metrics.estimatedCostUsd === null ? "—" : `$${Number(metrics.estimatedCostUsd ?? 0).toFixed(4)}`;
    telemetry.replaceChildren();
    for (const [name, value, note] of [
      ["MODEL CALLS", recorded(metrics?.modelCalls), metrics ? `${number(metrics.toolCalls ?? 0)} recorded tool calls` : "No selected mission"],
      ["TOKENS USED", recorded((metrics?.inputTokens ?? 0) + (metrics?.outputTokens ?? 0)), metrics?.usageUnknownCalls ? `${number(metrics.usageUnknownCalls)} calls with unknown usage` : metrics ? `${number(metrics.cachedInputTokens ?? 0)} cached input tokens` : "Usage appears after a run"],
      ["ESTIMATED COST", cost, metrics?.estimatedCostUsd === null ? "Provider pricing unavailable" : data.run?.input?.mode === "demo" ? "Offline demo · no provider calls" : "Recorded provider usage"],
      ["ELAPSED", metrics ? `${((metrics.elapsedMs ?? 0) / 1000).toFixed(1)}s` : "—", metrics ? `${number(metrics.compactions ?? 0)} context compactions` : "No mission history yet"],
    ]) { const card = el("div", undefined, "brain-network-telemetry-card"); card.append(el("span", name), el("strong", value), el("small", note)); telemetry.append(card); }
    const head = el("div", undefined, "brain-network-section-heading"), open = button("VIEW WORKFLOW ↗", "brain-network-history-open"); open.dataset.networkNavigate = "mission";
    head.append(el("h3", "MISSION HISTORY"), open); history.replaceChildren(head);
    if (!data.runs.length) { history.append(el("p", "No recorded missions. Start with an offline demo to see the plan, tool observations and review checkpoint.", "brain-network-empty")); return; }
    const rows = el("div", undefined, "brain-network-history-rows");
    for (const run of data.runs.slice(0, 4)) {
      const row = el("div", undefined, "brain-network-history-row"), title = el("div");
      title.append(el("strong", run.input?.symbol || "RESEARCH"), el("span", run.input?.objective || "Saved research mission"));
      row.append(title, el("span", run.input?.mode === "demo" ? "OFFLINE DEMO" : "ANALYSIS"), el("span", label(run.status).toUpperCase())); rows.append(row);
    }
    history.append(rows);
  }
  function renderNodes() {
    const focusedId = nodeList.contains(document.activeElement) ? document.activeElement.dataset.networkNode : null;
    const remaining = new Set(data.nodes.map((node) => node.id));
    for (const [id, item] of nodeButtons) if (!remaining.has(id)) { item.remove(); nodeButtons.delete(id); }
    for (const [index, node] of data.nodes.entries()) {
      const item = nodeButtons.get(node.id) ?? button(undefined, `brain-network-node brain-network-node-${node.kind}`); item.dataset.networkNode = node.id;
      item.style.setProperty("--node-index", index);
      item.hidden = !visible(node); item.setAttribute("aria-label", `${node.name}, ${node.kind === "memory" ? node.subtype : node.kind}`); item.setAttribute("aria-pressed", String(node.id === selectedId)); item.title = node.name;
      const dot = el("span", node.kind === "agent" ? `0${ROLES.findIndex((role) => role.id === node.role) + 1}` : node.kind === "module" ? "◇" : "·", "brain-network-node-dot"); dot.setAttribute("aria-hidden", "true");
      const text = el("span", undefined, "brain-network-node-copy"); text.append(el("span", node.name, "brain-network-node-name"), el("small", node.kind === "core" ? "ORCHESTRATION" : node.kind === "agent" ? label(node.status).toUpperCase() : node.kind === "module" ? "SUPPORT MODULE" : label(node.kind).toUpperCase()));
      item.replaceChildren(dot, text, el("span", "↗", "brain-network-node-arrow"));
      item.dataset.active = String(active(node.status)); nodeButtons.set(node.id, item);
      if (nodeList.children[index] !== item) nodeList.insertBefore(item, nodeList.children[index] ?? null);
      if (node.region) {
        const lobe = lobeButtons.get(node.id) ?? button(undefined, "brain-network-lobe"); lobe.dataset.lobeNode = node.id;
        lobe.setAttribute("aria-label", `Inspect ${node.name} ${node.kind === "agent" ? "agent" : "support module"}`); lobe.setAttribute("aria-pressed", String(node.id === selectedId));
        lobe.replaceChildren(el("strong", node.name), el("small", node.kind === "agent" ? label(node.status).toUpperCase() : "SUPPORT MODULE"));
        lobeButtons.set(node.id, lobe); if (!labels.contains(lobe)) labels.append(lobe);
      }
    }
    // Moving an existing source to a new position can blur it in some browsers.
    const focused = nodeButtons.get(focusedId);
    if (focused && !focused.hidden && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }
  function draw() {
    if (disposed) return;
    const progress = Math.min(1, Math.max(0, (sceneTime - explosionStart) / 850)); exploded = explosionFrom + (explosionTarget - explosionFrom) * (1 - (1 - progress) ** 3);
    const selected = data.nodes.find((node) => node.id === selectedId), parent = data.nodes.find((node) => node.id === selected?.parent);
    const anchors = renderCanvas?.({ width, height, zoom, time: sceneTime, yaw: yaw + rotation, pitch, exploded, assembly: assemblyStart === null ? 1.6 : (sceneTime - assemblyStart) / 1000 * .75, selectedRegion: selected?.region ?? parent?.region });
    const sides = { left: [], right: [] };
    for (const [id, item] of lobeButtons) {
      const node = data.nodes.find((node) => node.id === id), point = anchors?.get(node.region) ?? project(node.position);
      const side = anchors ? point.x < width / 2 ? "left" : "right" : [...lobeButtons.keys()].indexOf(id) % 2 ? "right" : "left";
      sides[side].push({ item, point, node });
    }
    const labelWidth = Math.min(122, width * .245), labelHeight = 35;
    for (const [side, entries] of Object.entries(sides)) {
      entries.sort((a, b) => a.point.y - b.point.y);
      const minY = 67, maxY = Math.max(minY, height - 110 - labelHeight);
      const gap = Math.min(48, (maxY - minY) / Math.max(1, entries.length - 1)), span = gap * (entries.length - 1);
      const start = Math.max(minY, Math.min(maxY - span, height * .43 - span / 2));
      entries.forEach(({ item, point, node }, index) => {
        const y = start + index * gap, x = side === "left" ? 12 : width - labelWidth - 12;
        item.style.left = `${x}px`; item.style.top = `${y}px`; item.style.width = `${labelWidth}px`;
        if (context) { context.beginPath(); context.moveTo(point.x, point.y); const endpoint = side === "left" ? x + labelWidth : x; context.lineTo(endpoint + (side === "left" ? 12 : -12), y + labelHeight / 2); context.lineTo(endpoint, y + labelHeight / 2); context.strokeStyle = node.id === selectedId ? canvasColors.red || "#ff2e43" : canvasColors.line || "#493039"; context.lineWidth = node.id === selectedId ? 1.4 : .7; context.stroke(); context.fillStyle = canvasColors.red || "#ff2e43"; context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3); }
      });
    }
    coordinate.textContent = `NEURAL MATRIX / ${explosionTarget ? "DISASSEMBLED" : "ASSEMBLED"}`;
  }
  function visibleStage() { return !document.hidden && intersecting && !stage.closest("[hidden]") && width > 0; }
  function animate(time) {
    frame = null; if (disposed || paused || !hasCanvas || !visibleStage()) { stopAnimation(); return; }
    // An accumulated scene clock freezes exactly where it was paused. Refreshes and
    // background-tab time cannot reset the scene or create a jump on resume.
    if (lastPaint === null || time - lastPaint >= 1000 / 30) {
      if (lastFrameTime !== null) { const elapsed = Math.min(100, Math.max(0, time - lastFrameTime)); sceneTime += elapsed; if (!drag) rotation += elapsed / 1000 * .18; }
      lastFrameTime = time; draw(); lastPaint = time;
    }
    frame = window.requestAnimationFrame(animate);
  }
  function startAnimation() {
    const running = !disposed && !paused && visibleStage(); shell.dataset.motion = running ? "running" : "paused";
    if (frame === null && running && hasCanvas && window?.requestAnimationFrame) frame = window.requestAnimationFrame(animate);
  }
  function stopAnimation() {
    if (frame !== null) window?.cancelAnimationFrame?.(frame);
    frame = null; lastFrameTime = null; lastPaint = null; shell.dataset.motion = "paused";
  }
  function refresh() {
    if (disposed) return;
    const rect = stage.getBoundingClientRect(); width = rect.width || stage.clientWidth || 680; height = rect.height || stage.clientHeight || 540;
    const ratio = Math.min(window?.devicePixelRatio || 1, 2); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(); startAnimation();
  }
  function setMotion(value) { paused = value; motion.textContent = paused ? "▷" : "Ⅱ"; motion.setAttribute("aria-label", paused ? "Resume network motion" : "Pause network motion"); motion.setAttribute("aria-pressed", String(paused)); paused ? stopAnimation() : startAnimation(); draw(); }
  function setZoom(value) { zoom = Math.min(1.45, Math.max(.65, value)); zoomLabel.textContent = `${Math.round(zoom * 100)}%`; zoomIn.disabled = zoom >= 1.45; zoomOut.disabled = zoom <= .65; draw(); }
  listen(filters, "click", (event) => { const item = event.target.closest("[data-network-filter]"); if (!item) return; filter = item.dataset.networkFilter; for (const entry of filters.children) entry.setAttribute("aria-pressed", String(entry === item)); for (const node of data.nodes) nodeButtons.get(node.id).hidden = !visible(node); if (!visible(data.nodes.find((node) => node.id === selectedId))) selectedId = "omen"; renderInspector(); draw(); });
  listen(nodeList, "click", (event) => { const item = event.target.closest("[data-network-node]"); if (!item) return; selectedId = item.dataset.networkNode; renderInspector(); draw(); });
  listen(labels, "click", (event) => { const item = event.target.closest("[data-lobe-node]"); if (!item) return; selectedId = item.dataset.lobeNode; renderInspector(); draw(); });
  listen(shell, "click", (event) => { const item = event.target.closest("[data-network-navigate]"); if (item && ["mission", "knowledge", "checks", "network", "robinhood"].includes(item.dataset.networkNavigate)) onNavigate(item.dataset.networkNavigate); });
  const toggleExplosion = () => { explosionFrom = exploded; explosionTarget = explosionTarget ? 0 : 1; explosionStart = sceneTime; if (paused || !hasCanvas) { exploded = explosionTarget; explosionFrom = exploded; } disassemble.textContent = explosionTarget ? "ASSEMBLE" : "DISASSEMBLE"; disassemble.setAttribute("aria-pressed", String(Boolean(explosionTarget))); draw(); };
  listen(disassemble, "click", toggleExplosion);
  listen(reassemble, "click", () => { assemblyStart = paused || !hasCanvas ? null : sceneTime; draw(); });
  listen(zoomOut, "click", () => setZoom(zoom - .1)); listen(zoomIn, "click", () => setZoom(zoom + .1)); listen(reset, "click", () => { yaw = -.6; pitch = .22; rotation = 0; setZoom(1); }); listen(motion, "click", () => setMotion(!paused));
  listen(stage, "pointerdown", (event) => { if (event.button !== 0 || event.pointerType === "touch" || event.target.closest("button")) return; drag = { x: event.clientX, y: event.clientY, yaw, pitch, id: event.pointerId }; stage.setPointerCapture?.(event.pointerId); stage.classList.add("brain-network-dragging"); });
  listen(stage, "pointermove", (event) => { if (!drag) return; yaw = drag.yaw + (event.clientX - drag.x) * .008; pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (event.clientY - drag.y) * .008)); draw(); });
  const endDrag = () => { if (drag) { try { stage.releasePointerCapture?.(drag.id); } catch { /* Capture can end outside the viewport. */ } drag = null; stage.classList.remove("brain-network-dragging"); } };
  listen(stage, "pointerup", (event) => {
    if (drag && Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) < 5) {
      const rect = stage.getBoundingClientRect(), region = renderCanvas?.hitTest(event.clientX - rect.left, event.clientY - rect.top), node = data.nodes.find((item) => item.region === region);
      if (node) { selectedId = node.id; renderInspector(); draw(); }
    }
    endDrag();
  }); listen(stage, "pointercancel", endDrag);
  listen(stage, "keydown", (event) => {
    if (event.target !== stage) return;
    if (event.key === "ArrowLeft") yaw -= .12; else if (event.key === "ArrowRight") yaw += .12; else if (event.key === "ArrowUp") pitch = Math.max(-1.2, pitch - .1); else if (event.key === "ArrowDown") pitch = Math.min(1.2, pitch + .1); else if (event.key.toLowerCase() === "e") toggleExplosion(); else if (["+", "="].includes(event.key)) setZoom(zoom + .1); else if (event.key === "-") setZoom(zoom - .1); else return;
    event.preventDefault(); draw();
  });
  listen(document, "visibilitychange", () => { if (document.hidden) stopAnimation(); else startAnimation(); });
  listen(window, "resize", refresh); listen(motionQuery, "change", (event) => setMotion(event.matches));
  listen(document, "omensite:themechange", () => { canvasColors = palette(); renderCanvas?.setColors(canvasColors); draw(); });
  const resizeObserver = typeof window?.ResizeObserver === "function" ? new window.ResizeObserver(refresh) : null; resizeObserver?.observe(stage);
  const intersectionObserver = typeof window?.IntersectionObserver === "function" ? new window.IntersectionObserver((entries) => { intersecting = entries.some((entry) => entry.isIntersecting); if (intersecting) refresh(); else stopAnimation(); }) : null; intersectionObserver?.observe(stage);
  function update(state = {}) {
    if (disposed) return; data = buildBrainNetworkData(state); if (!data.nodes.some((node) => node.id === selectedId)) selectedId = "omen";
    lock.textContent = data.paidCallsEnabled ? "PROVIDER ACCESS ENABLED" : "PAID CALLS LOCKED"; lock.dataset.enabled = String(data.paidCallsEnabled);
    mode.textContent = data.run ? `${data.run.input?.mode === "demo" ? "OFFLINE DEMO" : "MISSION"} / ${label(data.run.status).toUpperCase()}` : "IDLE / OFFLINE READY";
    footer.replaceChildren();
    for (const [name, value] of [["AGENTS", data.counts.agents], ["TOOLS", data.counts.tools], ["SOURCES", data.counts.documents], ["MEMORIES", data.counts.memories]]) { const item = el("span"); item.append(el("b", number(value)), document.createTextNode(` ${name}`)); footer.append(item); }
    footer.append(el("span", "4 SUPPORT MODULES · 3,400 DECORATIVE GLYPHS", "brain-network-footer-hint"));
    renderNodes(); renderInspector(); renderActivity(); renderTelemetry(); refresh();
  }
  update(); setMotion(paused);
  return { update, refresh, dispose() { if (disposed) return; disposed = true; stopAnimation(); endDrag(); resizeObserver?.disconnect(); intersectionObserver?.disconnect(); for (const remove of listeners) remove(); nodeButtons.clear(); lobeButtons.clear(); } };
}
