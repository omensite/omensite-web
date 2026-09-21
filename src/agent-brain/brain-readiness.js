/** Summarize completed local fixtures; never accept client-supplied readiness. */
export function summarizeOfflineEvaluation(report, now = new Date()) {
  if (!report || !Number.isInteger(report.total) || report.total < 1 ||
      !Array.isArray(report.cases) || report.cases.length !== report.total ||
      report.cases.some((item) => typeof item?.passed !== "boolean")) return null;
  const passed = report.cases.filter((item) => item.passed).length;
  if (report.passed !== passed || report.failed !== report.total - passed) return null;
  return { checkedAt: now.toISOString(), passed, failed: report.failed, total: report.total };
}

/** Read-only setup evidence. Building this view never invokes a provider or feed. */
export function buildBrainReadiness({ state, documents = [], lastEvaluation = null, now = new Date() }) {
  const paidCallsEnabled = state.paidCallsEnabled === true;
  const providers = state.providers ?? [];
  const primary = providers.find((provider) => provider.id === state.defaultProvider);
  const knowledgeCount = documents.filter((document) => document.kind === "knowledge").length;
  const memoryCount = documents.filter((document) => document.kind === "memory").length;
  const demo = (state.runs ?? []).find((run) => run.input?.mode === "demo" && run.result &&
    ["awaiting_approval", "completed"].includes(run.status) && run.metrics?.modelCalls === 0);
  const durable = state.storage?.persistent === true;
  const storageName = { sqlite: "SQLite", postgres: "PostgreSQL", memory: "In-memory" }[state.storage?.kind] ?? "Unknown";
  const check = (id, label, status, detail) => ({ id, label, status, detail });
  return {
    checkedAt: now.toISOString(), paidCallsEnabled,
    checks: [
      check("paid_ai", "Paid AI calls", paidCallsEnabled ? "ready" : "locked", paidCallsEnabled
        ? "Enabled by server configuration. Analysis requests can incur provider charges."
        : "Locked on the server for Gemini, OpenAI and Claude. Adding a key cannot unlock calls. Offline demos and checks remain available."),
      check("offline_evals", "Offline system checks", lastEvaluation?.failed === 0 ? "ready" : "pending", lastEvaluation
        ? `${lastEvaluation.passed}/${lastEvaluation.total} deterministic scenarios passed at ${lastEvaluation.checkedAt}. These check system behavior with fixtures; they do not validate model quality.`
        : "Run offline evals to check orchestration, tool boundaries, retrieval, approval, persistence and budgets. No provider calls are used. Results reset when this server restarts."),
      check("demo_workflow", "Demo workflow and review", demo ? "ready" : "pending", demo
        ? `A saved demo reached ${demo.status === "completed" ? "accepted research memory" : "the human review checkpoint"} with zero model calls. Its prices and decisions are illustrative.`
        : "Run the offline demo to exercise tools, the workflow graph, risk checks, traces and human review in this account."),
      check("storage", "Run and memory storage", durable ? "ready" : "pending", durable
        ? `${storageName} persistence is configured and account records were read successfully. Backup and deployment recovery still require operational validation.`
        : `${storageName} storage is active. Persistent storage must be configured before relying on recovery across server restarts.`),
      check("knowledge", "Knowledge sources", knowledgeCount > 0 ? "ready" : "pending", knowledgeCount > 0
        ? `${knowledgeCount} source document${knowledgeCount === 1 ? " is" : "s are"} available to retrieval. Source accuracy and freshness require your review.`
        : "Add your strategy rules and research documents to test retrieval against your own material. Uploading text does not call an AI provider."),
      check("memory", "Approved research memory", memoryCount > 0 ? "ready" : "pending", memoryCount > 0
        ? `${memoryCount} accepted research record${memoryCount === 1 ? " is" : "s are"} available. Demo memories retain their illustrative provenance.`
        : "Accept a reviewed demo to exercise saving research memory. This approval never authorizes a trade."),
      check("credentials", "Default provider credentials", primary?.configured === true ? "ready" : "pending", primary?.configured === true
        ? `${primary.label ?? primary.id} has a server-side key. Its validity has not been checked by this view; the paid-call lock is separate.`
        : "No key is configured for the default provider. Credentials are optional while building and testing offline."),
      check("pricing", "Default provider cost settings", primary?.pricingConfigured === true ? "ready" : "pending", primary?.pricingConfigured === true
        ? "Server pricing is configured for the default provider. Verify the rates against your account before any later activation."
        : "Dollar budgets require model-specific server pricing. Offline demos and evaluations cost no provider tokens."),
      check("live_validation", "Live AI validation", "pending", "Provider responses, model quality, billed usage and provider prompt-cache behavior remain outside the offline checks. No paid validation is triggered here."),
      check("market_data", "Live market data", "pending", "Market snapshots are supplied manually. A live price and order-flow feed is not connected to the brain."),
      check("execution", "Broker execution", "pending", "This system prepares and reviews research. A broker connection and order execution are not implemented."),
    ],
  };
}
