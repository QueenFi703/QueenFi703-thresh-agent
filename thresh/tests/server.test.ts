import { describe, it, afterEach, before as beforeAll, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import type { Server } from "node:http";
import { Probot } from "probot";
import { createThreshServer } from "../app/server.js";

let server: Server;
let base: string;
const secret = "synthetic-webhook-secret";
beforeAll(async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const probot = new Probot({ appId: 1, privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), secret, logLevel: "fatal" });
  server = await createThreshServer(probot);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
describe("Probot 14 HTTP integration", () => {
  it("provides a health endpoint after middleware loads", async () => {
    const response = await fetch(`${base}/healthz`);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { status: "ok" });
  });
  it("returns 404 for unknown routes instead of hanging", async () => {
    assert.strictEqual((await fetch(`${base}/missing`)).status, 404);
  });
  it("accepts a correctly signed ping without GitHub credentials", async () => {
    const body = JSON.stringify({ zen: "synthetic local ping" });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const response = await fetch(`${base}/api/github/webhooks`, { method: "POST", body, headers: {
      "content-type": "application/json", "x-github-event": "ping", "x-github-delivery": "synthetic-valid", "x-hub-signature-256": signature,
    } });
    assert.strictEqual(response.status, 200);
  });
  it("rejects an invalid webhook signature", async () => {
    const response = await fetch(`${base}/api/github/webhooks`, { method: "POST", body: "{}", headers: {
      "content-type": "application/json", "x-github-event": "ping", "x-github-delivery": "synthetic-invalid", "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
    } });
    assert.strictEqual(response.status, 400);
  });
});
