# Omensite / Redline Cortex UI

The `dev2` interface adapts the user-supplied `tests/redline-cortex.zip`. The original archive stays local; the required design tokens, artwork and adapted renderer are committed as ordinary application assets. The application remains EJS and browser JavaScript.

## Design mapping

| Reference element | Omensite implementation |
| --- | --- |
| Core and Daylight tokens | `public/css/redline-tokens.css`; shared aliases and shell in `redline.css` |
| Chakra Petch / IBM Plex Sans / JetBrains Mono | Display headings / reading text / numerical and technical values |
| Flat panels with red corner brackets | Reusable Cortex panels across Brain, research, journal, alerts, calendar and administration |
| MatrixBrain | Seeded 3,400-glyph anatomical renderer, lobe inspection, rotation, zoom, disassembly and reformation |
| AgentRoster / AgentDetail / ActivityStream | Four actual agent roles, four explicitly labeled support modules, and saved mission traces |
| KPI tiles and market cards | Actual application counts, recorded mission usage, and equal stocks/options/crypto entry points |
| Cover art | Supplied block-and-binary SVG adapted for Discord sign-in |

The source demo's account balances, performance charts, eight simulated agents, random market values and pretend connection flows are not application data. Those demos are replaced by existing server state and honest empty states. Omensite remains the product name. The app's persistent navigation and real forms are retained.

## Behavior

- Core is the default. Daylight is a user preference stored under `omensite-theme`; it contains no account information. The canvas updates when the theme changes.
- Brain animation is decorative and uses no model tokens. It runs at a capped 30 fps, stops when hidden, supports manual pause and reduced motion, and disposes its observers and handlers when leaving the route.
- Agent, tool, source and mission controls remain keyboard accessible without canvas support. The canvas supports arrow-key rotation and `E` for disassembly when focused.
- Smaller screens use a navigation drawer and put the Brain above its roster and inspector. Forms and market cards keep their existing actions.
- Discord authentication, capability filtering, paid-AI settings, broker submission locks, exact-action review, CSRF and owner isolation remain enforced by the existing server.
- The Brain state endpoint adds an explicit projection of broker connection switches and storage status. It does not expose tokens, account snapshots or broker action payloads to the decorative renderer.

Assets use the existing content-hashed manifest. Restart the application after deploying changed assets so it serves the new asset version. This branch does not change deployment targets or database configuration.
