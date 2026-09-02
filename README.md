# OMENSITE MVC

OMENSITE is an Express/EJS rebuild of the accepted retro-terminal trading-operations preview. It preserves cinematic authentication and the terminal shell while using clean, refreshable server routes and fragment navigation.

## Run locally

Node.js 24 or newer is required.

```text
npm install
npm run dev
npm test
npm start
```

The server reads `HOST` and `PORT` from the environment (`HOST` defaults to `127.0.0.1`; `PORT` defaults to `3000`).

## Routes

- `/login`
- `/home`
- `/indicators`
- `/market-news`
- `/alerts/ict`
- `/alerts/support-resistance`
- `/journal`
- `/journal/new`
- `/journal/:id`

## Current boundaries

Authentication is a local demonstration boundary. Any non-empty username and passkey are accepted; for example, username `operator` and passkey `preview`. A later integration may replace the auth service with Discord OAuth without changing page controllers or views.

Journal entries currently live in a browser-local repository and begin empty; no demo trades are seeded. The repository/service boundary is intentionally replaceable by PostgreSQL persistence later.

Full document requests render the EJS application shell on the server. In-shell links request only route fragments with `X-Omensite-Fragment: 1`, swap the route view through the shared navigator, update browser history/title, and reinitialize page-local behavior. Direct refresh, back/forward navigation, and non-JavaScript requests continue to use clean server routes.

The accepted static implementation is retained under `reference/static-original/` for visual comparison during migration.

## Production sessions and TLS

Production startup requires `SESSION_SECRET` and a durable `express-session` store injected through `createApp({ sessionStore })`; the default in-memory store is reserved for local development and tests. The deployment must terminate HTTPS either in Node or at a trusted reverse proxy because production cookies are `Secure`. `createApp` trusts one proxy hop by default in production; pass the deployment-appropriate `trustProxy` value when the proxy topology differs. Forwarded protocol headers must be accepted only from that trusted proxy.
