import test from "node:test";
import assert from "node:assert/strict";
import { createAuthService } from "../../src/services/auth-service.js";

test("demo auth rejects blank credentials", async () => {
  const auth = createAuthService();
  await assert.rejects(
    () => auth.authenticate({ username: " ", passkey: "" }),
    { code: "CREDENTIALS_REQUIRED" },
  );
});

test("demo auth returns the normalized operator identity", async () => {
  const auth = createAuthService();
  assert.deepEqual(
    await auth.authenticate({ username: " local_operator ", passkey: "preview" }),
    { id: "local_operator", username: "local_operator" },
  );
});
