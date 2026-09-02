import { createApp } from "./app.js";
import { readAuthConfig } from "./config/auth-config.js";

const port = process.env.PORT ?? 3000;
const host = process.env.HOST || "127.0.0.1";
const authConfig = readAuthConfig({
  env: process.env.NODE_ENV === "production"
    ? process.env
    : { AUTH_MODE: "demo", DEMO_ROLES: "Developer", ...process.env },
});
const app = createApp({ authConfig });

app.listen(port, host, () => {
  console.log(`OMENSITE listening on http://${host}:${port}`);
});
