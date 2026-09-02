import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import test from "node:test";

function reservePort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForOutput(child, pattern) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`server startup timeout: ${output}`)), 5000);
    const onData = (chunk) => {
      output += chunk;
      if (pattern.test(output)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited ${code}: ${output}`));
    });
  });
}

test("server honors HOST and logs the full listening address", async () => {
  const host = "127.0.0.2";
  const port = await reservePort(host);
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("../..", import.meta.url),
    env: { ...process.env, HOST: host, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const output = await waitForOutput(child, /OMENSITE listening/);
    assert.match(output, new RegExp(`http://${host}:${port}`));
    await fetch(`http://${host}:${port}/login`).then((response) => assert.equal(response.status, 200));
    await assert.rejects(fetch(`http://127.0.0.1:${port}/login`));
  } finally {
    child.kill();
  }
});
