import assert from "node:assert";
import { test, afterEach } from "node:test";
import { NextRequest } from "next/server";
import { hasSharedSecret } from "./security";

function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

afterEach(() => {
  setNodeEnv(undefined);
});

test("hasSharedSecret allows missing secret only outside production", () => {
  setNodeEnv("test");
  const req = new NextRequest("http://localhost/api/cron/run");
  assert.strictEqual(hasSharedSecret(req, null), true);

  setNodeEnv("production");
  assert.strictEqual(hasSharedSecret(req, null), false);
});

test("hasSharedSecret validates bearer token", () => {
  setNodeEnv("production");
  const req = new NextRequest("http://localhost/x", {
    headers: { authorization: "Bearer s3cret" },
  });
  assert.strictEqual(hasSharedSecret(req, "s3cret", { queryNames: [] }), true);
  assert.strictEqual(hasSharedSecret(req, "other", { queryNames: [] }), false);
});
