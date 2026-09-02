# OMENSITE

**Version v0.1.1 — Early Development Preview**

> An AI-assisted trading intelligence platform for execution review, structured journaling, indicator research, trader education, and weekly market context.

## Overview

OMENSITE is designed to help discretionary traders convert market activity into a disciplined, repeatable learning process. The platform brings trade records, post-execution analysis, research tools, educational material, and market intelligence into a single operational workspace.

The long-term objective is to use AI to examine trade executions alongside the trader's thesis, risk plan, confluences, and outcome. Rather than merely reporting profit and loss, OMENSITE aims to identify recurring behaviors, highlight strengths and weaknesses, and produce practical feedback that can improve future decision-making.

## Product direction

- **AI-assisted execution analysis** — Evaluate entries, exits, risk management, timing, market context, and recurring behavioral patterns to generate objective post-trade feedback.
- **Extensive trade journal** — Capture a trade's thesis, direction, confluences, execution details, result, and lessons in a consistent, searchable record.
- **Indicator library** — Organize indicator references, configurations, use cases, and supporting research in one accessible catalog.
- **Educational content** — Provide structured material for developing market knowledge, execution discipline, and repeatable trading processes.
- **Weekly market intelligence** — Deliver a focused briefing on meaningful market developments, scheduled events, and conditions that may affect the coming trading week.

## What v0.1.1 includes

This release establishes OMENSITE's application architecture and core user experience:

- An Express 5 and EJS Model-View-Controller application.
- Clean, refreshable routes with progressive fragment navigation.
- Seamless terminal-style page transitions and glitch effects.
- A cinematic Matrix-inspired login sequence with animated terminal graphics.
- Mode-aware demonstration and Discord OAuth2 authentication with server-enforced, role-based module access.
- A temporary-memory Admin panel for user sessions, bans, roles, and indicator-access decisions.
- A request-all indicator workflow that records TradingView usernames and consent for manual access grants.
- A browser-local trade journal with create, list, detail, and shareable-view workflows.
- A native live economic calendar with high/medium impact and market filters.
- Automated integration and unit tests for routing, authentication, navigation, transitions, and journal behavior.

AI analysis, brokerage or execution-data imports, PostgreSQL persistence, automated TradingView access grants, and editorial content pipelines are planned capabilities and are not connected in v0.1.1.

## Technology

- Node.js 24+
- Express 5
- EJS server-rendered views
- Vanilla JavaScript with progressive enhancement
- CSS-based terminal, CRT, Matrix, and glitch presentation
- `express-session` authentication boundary
- Browser `localStorage` journal repository

The application renders complete pages on direct requests. Internal navigation requests route fragments, replaces only the active content area, updates browser history, and rehydrates page-specific behavior. This preserves the fluidity of a client application while retaining dependable server routes and refresh behavior.

## Run locally

### Windows launcher

Double-click `start-omensite.bat` from the project root. The launcher installs missing dependencies and opens the server at:

```text
http://127.0.0.1:4173
```

Press `Ctrl+C` in the terminal window to stop the server.

The launcher calls the existing `npm start` command. That command reads the local `.env` file automatically; the launcher never prints authentication secrets.

### Command line

```bash
npm install
npm start
```

Copy `.env.example` to `.env` before the first local run. The supplied local configuration uses demonstration authentication and listens on `127.0.0.1:4173`. The `.env` file is ignored by Git and must remain uncommitted.

For automatic restarts during development:

```bash
npm run dev
```

### Live market calendar

Market News is officially powered by Economicium's public JSON API. OMENSITE retrieves the calendar directly from this public endpoint, so no account, API key, or environment configuration is required.

OMENSITE keeps only high- and medium-impact economic releases, maps each country to its affected currency, converts release times to the workstation's timezone, and groups the results by day. The server caches a successful response for 24 hours; the terminal's refresh control can request an immediate update. If the source is temporarily unavailable, the last successful in-memory result remains visible as stale data.

The source provides release schedules and impact classifications derived from official public or openly licensed sources. It deliberately does not provide proprietary consensus forecasts, actual releases, or previous values. See the [Economicium calendar](https://www.economicium.com/economic-calendar/) and its [public JSON endpoint](https://www.economicium.com/api/calendar).

## Authentication and access

### Demo access

With `AUTH_MODE=demo`, any non-empty username and passkey are accepted, such as:

```text
Username: operator
Passkey:  preview
```

`DEMO_ROLES` controls the local identity's roles. Demo mode is for workstation testing only and is rejected when `NODE_ENV=production`.

### Discord SSO setup

Discord authentication uses an OAuth2 application and the signed-in member's server roles. A Discord bot, bot user, and bot token are not required.

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), then open **OAuth2**.
2. Register this exact local redirect URI: `http://127.0.0.1:4173/auth/discord/callback`. Register the deployment's HTTPS callback separately before hosting.
3. Copy the application's client ID and client secret into the matching `.env` entries. Never commit the populated `.env` file.
4. In Discord, enable **User Settings → Advanced → Developer Mode**. Right-click the target server and each access role to copy their IDs into `DISCORD_GUILD_ID` and the five `DISCORD_ROLE_*_ID` entries. Configuration uses IDs, not editable role names.
5. Generate a long, random production `SESSION_SECRET`, for example with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`, and store it only in the deployment's secret configuration.
6. Change `AUTH_MODE=discord` and restart the application.

Users authorize only the `identify` and `guilds.members.read` OAuth2 scopes. OMENSITE rechecks the member's roles every five minutes by default. If Discord cannot confirm membership during a required refresh, access fails closed until the identity can be verified again.

Role behavior is modular:

- `Developer` and `Admin` grant base access, Indicators, Journal, and Admin capabilities.
- `OS` grants base site access.
- `Indicators` adds access to the Indicators module.
- `Journal` adds access to the Journal module.
- A member must have `Developer`, `Admin`, or `OS` for base site access; module-only roles do not admit a user by themselves.

Every primary navigation item remains visible. When a user selects a module they cannot access, the existing terminal transition reports `ACCESS FAILED :: INSUFFICIENT PERMISSIONS` and returns them to the current page.

### Temporary memory and TradingView access

User snapshots, bans, session indexes, and indicator requests are stored in process memory for v0.1.1. Restarting the server clears this operational state. PostgreSQL and a durable production session store will replace these repositories in a later release.

OMENSITE records a request for all active invite-only indicators, including the member's TradingView username and explicit consent. An authorized administrator must still open TradingView's **Manage Access** interface, grant or deny access manually, and then record the matching decision in OMENSITE. The application does not call an undocumented TradingView endpoint or grant access automatically.

## Application routes

- `/login` — Authentication terminal
- `/auth/discord` — Discord OAuth2 sign-in entry point when Discord mode is active
- `/home` — Operations dashboard
- `/indicators` — Invite-only indicator catalog and access-request workflow
- `/market-news` — Live current-week high- and medium-impact economic calendar
- `/alerts/ict` — ICT alert workspace
- `/alerts/support-resistance` — Support and resistance alert workspace
- `/journal` — Trade journal
- `/journal/new` — New journal entry
- `/journal/:id` — Public journal record
- `/admin` — Temporary-memory user and indicator-request administration

## Testing

Run the complete automated test suite with:

```bash
npm test
```

## Roadmap

1. PostgreSQL-backed journal storage and server-side journal services.
2. Durable Discord user, ban, session, and indicator-request persistence.
3. Trade-execution ingestion from supported brokers or structured imports.
4. AI-assisted post-trade analysis and pattern detection.
5. Production indicator, educational-content, and weekly market-intelligence libraries.
6. Future streaming updates and configurable alert providers.

## Production considerations

Production startup requires `AUTH_MODE=discord`, complete Discord application/guild/role configuration, `SESSION_SECRET`, and a durable `express-session` store supplied through `createApp({ sessionStore })`. The in-memory store is reserved for local development and automated tests.

Deployments must use HTTPS, either directly in Node.js or through a trusted reverse proxy, because production session cookies are marked `Secure`. `createApp` trusts one proxy hop by default in production; deployments with a different topology must provide the appropriate `trustProxy` value.

## Project reference

The accepted static prototype is preserved in `reference/static-original/` for design and interaction comparisons during development.

## Disclaimer

OMENSITE is trading-analysis and educational software. It does not provide financial advice, guarantee trading performance, or replace independent research and risk management.
