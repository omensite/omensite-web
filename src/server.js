import { createApp } from "./app.js";

const port = process.env.PORT ?? 3000;
const host = process.env.HOST || "127.0.0.1";
const app = createApp();

app.listen(port, host, () => {
  console.log(`OMENSITE listening on http://${host}:${port}`);
});
