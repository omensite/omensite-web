import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

if (process.platform === "win32") {
  test("Windows launcher reports safe configuration and invokes npm start", async () => {
    const fakeBin = await mkdtemp(path.join(os.tmpdir(), "omensite-launcher-"));
    const nodeShim = path.join(fakeBin, "node.cmd");
    const npmShim = path.join(fakeBin, "npm.cmd");
    await writeFile(nodeShim, "@exit /b 0\r\n", "utf8");
    await writeFile(npmShim, [
      "@echo [TEST npm] %*",
      "@echo [TEST config] HOST=%HOST% PORT=%PORT%",
      "@exit /b 0",
      "",
    ].join("\r\n"), "utf8");

    const launcher = fileURLToPath(new URL("../../start-omensite.bat", import.meta.url));
    const childEnv = {
      ...process.env,
      PATH: `${fakeBin};${process.env.PATH}`,
      OMENSITE_SKIP_BROWSER: "1",
    };
    delete childEnv.HOST;
    delete childEnv.PORT;
    const child = spawn("cmd.exe", ["/d", "/c", "start-omensite.bat"], {
      cwd: path.dirname(launcher),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    try {
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      const exitCode = await new Promise((resolve) => child.once("exit", resolve));

      assert.equal(exitCode, 0, output);
      assert.match(output, /Authentication configuration: npm start loads \.env when present/);
      assert.match(output, /Browser launch skipped/);
      assert.match(output, /\[TEST npm\] start/);
      assert.match(output, /\[TEST config\] HOST= PORT=/);
      assert.doesNotMatch(output, /SESSION_SECRET|DISCORD_CLIENT_SECRET/);
    } finally {
      await rm(fakeBin, { recursive: true, force: true });
    }
  });
}
