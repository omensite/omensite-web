# OMENSITE

**Version v0.1.0 — Early Development Preview**

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

## What v0.1.0 includes

This release establishes OMENSITE's application architecture and core user experience:

- An Express 5 and EJS Model-View-Controller application.
- Clean, refreshable routes with progressive fragment navigation.
- Seamless terminal-style page transitions and glitch effects.
- A cinematic Matrix-inspired login sequence with animated terminal graphics.
- Demonstration session authentication behind a replaceable authentication service.
- A browser-local trade journal with create, list, detail, and shareable-view workflows.
- Interface foundations for indicator and alert features, plus a native live economic calendar with high/medium impact and market filters.
- Automated integration and unit tests for routing, authentication, navigation, transitions, and journal behavior.

AI analysis, brokerage or execution-data imports, Discord SSO, PostgreSQL persistence, and editorial content pipelines are planned capabilities and are not connected in v0.1.0.

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

### Command line

```bash
npm install
npm start
```

The server reads `HOST` and `PORT` from the environment. Without overrides, `npm start` listens on `127.0.0.1:3000`.

For automatic restarts during development:

```bash
npm run dev
```

### Live market calendar

To enable the live market calendar, copy `.env.example` to `.env`, replace the sample value with your licensed Trading Economics API key, and restart the app.

Missing or invalid credentials leave the terminal interface available with `[ CALENDAR DATA LINK OFFLINE ]`.

Production operators must obtain Trading Economics display and distribution rights appropriate to their deployment.

## Demo access

Authentication currently operates in demonstration mode. Any non-empty username and passkey are accepted, such as:

```text
Username: operator
Passkey:  preview
```

The authentication service is intentionally isolated so Discord OAuth can replace the demonstration provider without restructuring page controllers or views.

## Application routes

- `/login` — Authentication terminal
- `/home` — Operations dashboard
- `/indicators` — Indicator library foundation
- `/market-news` — Live current-week high- and medium-impact economic calendar
- `/alerts/ict` — ICT alert workspace
- `/alerts/support-resistance` — Support and resistance alert workspace
- `/journal` — Trade journal
- `/journal/new` — New journal entry
- `/journal/:id` — Public journal record

## Testing

Run the complete automated test suite with:

```bash
npm test
```

## Roadmap

1. PostgreSQL-backed journal storage and server-side journal services.
2. Discord OAuth for identity and access management.
3. Trade-execution ingestion from supported brokers or structured imports.
4. AI-assisted post-trade analysis and pattern detection.
5. Production indicator, educational-content, and weekly market-intelligence libraries.
6. Future streaming updates and configurable alert providers.

## Production considerations

Production startup requires `SESSION_SECRET` and a durable `express-session` store supplied through `createApp({ sessionStore })`. The in-memory store is reserved for local development and automated tests.

Deployments must use HTTPS, either directly in Node.js or through a trusted reverse proxy, because production session cookies are marked `Secure`. `createApp` trusts one proxy hop by default in production; deployments with a different topology must provide the appropriate `trustProxy` value.

## Project reference

The accepted static prototype is preserved in `reference/static-original/` for design and interaction comparisons during development.

## Disclaimer

OMENSITE is trading-analysis and educational software. It does not provide financial advice, guarantee trading performance, or replace independent research and risk management.
