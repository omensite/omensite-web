# Robinhood workspace

Open **Brain → Robinhood** (`/brain?view=robinhood`). Stocks/ETFs, options, and crypto have equal entry points. The workspace connects to Robinhood's official Streamable HTTP MCP service at `https://agent.robinhood.com/mcp/trading`; it does not scrape account pages or request a Robinhood password.

The integration uses the capabilities published in Robinhood's [agentic trading overview](https://robinhood.com/us/en/support/articles/agentic-trading-overview/) and [trading tool guide](https://robinhood.com/us/en/support/articles/trading-with-your-agent/), checked September 24, 2026. Robinhood describes reads across your accounts and trading through a dedicated Agentic account, supporting long equities, options, and crypto. Eligibility, account permissions, asset availability, and order acceptance are determined by Robinhood. The app must discover the authenticated tool schemas before building requests; test fixtures are not treated as Robinhood's real parameter contract.

## Setup

1. Keep Discord SSO configured. Discord identifies the Omensite operator; Robinhood authorization separately grants access to that operator's brokerage data.
2. Back up PostgreSQL and run the guarded migration command to apply `004_robinhood.sql` with the existing migrations before deploying. The new `broker_workspaces` table is required by `/health`. Local development without PostgreSQL creates `data/robinhood.sqlite`; memory-only storage cannot connect to a brokerage account.
3. Configure these values in the hosting vault, publish the environment, and restart the beta app:

   | Variable | Value |
   | --- | --- |
   | `ROBINHOOD_TOKEN_ENCRYPTION_KEY` | A durable, random 32-byte key encoded as 64 hexadecimal characters. Generate securely, retain in the vault, and back it up separately from the database. Never put it in Git or a client bundle. |
   | `ROBINHOOD_REDIRECT_URI` | `https://beta.omensite.com/auth/robinhood/callback` for beta. Use the matching HTTPS application origin for another deployment. If omitted, the app derives the callback origin from `DISCORD_REDIRECT_URI`. |
   | `ROBINHOOD_LIVE_TRADING_ENABLED` | `false` during setup. This is independent of the AI billing flag. |
   | `TRADER_PAID_AI_ENABLED` | Keep `false` until paid model validation is authorized. |

   Deployments sharing the same broker workspace database must retain the same Robinhood encryption key. A lost or replaced key makes existing credentials unreadable and requires reconnection; it must not silently fall back to plaintext. Production and beta already share identity-owned application records, so plan broker data and key sharing before promoting this integration to production.

4. Choose **Connect Robinhood**. The server registers the OAuth client and uses state validation and PKCE S256. Complete sign-in and review authorization on Robinhood. Any account opening, agreements, funding, and options permissions are completed by the account holder on Robinhood.
5. Once returned to Omensite, sync the tool catalog and fetch accounts, positions, quotes, and order history for the desired markets. Each result is saved with its retrieval time. Check any observation timestamp inside the result too: retrieval time does not establish quote freshness.
6. Prepare an order for review to validate the real broker preview. Keep live submissions locked while validating field compatibility, account selection, product permissions, and returned warnings. An unsupported or changed schema blocks the request and needs a reviewed adapter update.

## Operator and Brain flow

**Connect → research → preview → review → track.** The tool selector obtains actual fields from the authenticated MCP catalog. Basic fields use inputs and dropdowns. Nested structures, option legs, references, and union schemas currently use JSON fields with expandable broker definitions. This is an advanced workspace; a complete guided options ticket depends on observing the authenticated contract.

Read tools cover accounts, portfolio, positions, quotes, history, fundamentals, financials, price book, technical indicators, earnings, indexes, watchlists, and scanners. **Use as mission evidence** copies a dated result into the mission composer without starting a model call. Data remains an on-demand snapshot; there is no background price stream or automatic polling.

When paid AI is explicitly enabled later, the Brain can use:

- `robinhood.tools` to inspect a tool group's current schema.
- `robinhood.read` to retrieve account and market evidence with citations.
- `robinhood.propose` for the strategist to stage an exact action after the existing thesis risk check.

The existing linear price/stop risk calculator checks the research thesis. It does not validate that every broker argument matches that thesis, calculate multi-leg options exposure, or enforce portfolio-wide execution limits. Review actual account, contracts, sides, quantities, prices, and broker warnings before any future live activation. Demo runs cannot call any Robinhood tool. Gemini, OpenAI, and Claude routing stays available; no broker operation requires a paid AI call.

Order proposals call the corresponding Robinhood preview/review tool first. The preview must cover all order fields except explicit client idempotency identifiers. Cancel, watchlist, and scanner changes also enter the separate review queue. Each request stores exact arguments, preview when applicable, connection identity, schema hash, expiry, and version. Orders expire after 60 seconds; other changes expire after 180 seconds.

Research approval saves memory. Broker approval is a separate operator confirmation of a specific version. Live dispatch additionally requires `ROBINHOOD_LIVE_TRADING_ENABLED=true` and unpaused submissions. Models cannot change either switch or approve requests. Repeated or concurrent approval cannot dispatch the same saved request twice. Pausing or disconnecting prevents subsequent calls; it cannot recall an in-flight request or cancel an already working order.

An acknowledged request is displayed as **submitted**, not filled. Fetch the relevant order history and check Robinhood Activity for execution status. A timeout after dispatch becomes **unknown**, blocks further submissions, and is never automatically replayed, including after restart. There is currently no automated reconciliation or operator unlock for uncertain outcomes: investigate the actual order in Robinhood and perform a reviewed operational reconciliation before resuming. Never clear the database or reconnect as a way to retry an uncertain trade.

## Storage and controls

Tokens are encrypted with AES-256-GCM using the operator identity as authenticated data. Credentials never appear in the state API, browser storage, logs, or model context. The callback validates session-bound OAuth state and consumes it once. All other API routes require Discord admission; mutations also require CSRF protection. Catalog annotations cannot grant permissions: a published tool allowlist separates reads, previews, and writes. Arbitrary MCP hosts and model-provided network destinations are rejected.

PostgreSQL transactions atomically claim requests before dispatch. External calls run outside those transactions. Token refresh uses a saved lease. Requests have deadlines and size limits; each process permits at most two concurrent broker operations per operator and twelve total. No paid-call retries or background brokerage submissions are introduced.

Storage retains up to 12 data snapshots, 200 audit events, and 100 recent actions per operator, preserving unresolved submissions. The workspace is limited to 3 MB. These are bounded application records, not a permanent regulatory archive. Order-fill synchronization to the journal and unattended strategies are not implemented. Disconnect removes locally saved credentials; revoke the application's authorization in Robinhood as well when ending access.

## Verification

`npm test` covers encryption, OAuth/PKCE, owner isolation, CSRF, tool permissions, all three preview routes, expiry, schema drift, persistence, single dispatch, and uncertain outcomes using synthetic broker responses. `npm run eval:brain` checks the existing agent system without provider calls. Set `TEST_DATABASE_URL` only to a disposable PostgreSQL database to test migrations, concurrent updates, rollback, owner isolation, and saved records across fresh app runtimes.

Authenticated Robinhood tool discovery, account permissions, real preview compatibility, and any live execution require the user's Robinhood connection. Offline passing tests do not establish those capabilities or validate trading performance. Keep both activation flags false until the relevant setup and product-specific execution controls have been reviewed.
