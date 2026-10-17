import { describe, it, afterEach, before as beforeAll, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { loadRemotePatches } from "../patches/remote-loader.js";
const original = process.env.PATCH_REGISTRY_URL;
afterEach(() => { if (original === undefined) delete process.env.PATCH_REGISTRY_URL; else process.env.PATCH_REGISTRY_URL = original; mock.restoreAll(); });
it("returns built-in-only behavior when no registry is configured", async () => {
  delete process.env.PATCH_REGISTRY_URL;
  assert.deepStrictEqual(await loadRemotePatches(), []);
});
it("does not fetch or execute remote code even with a configured registry", async () => {
  process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
  const fetch = mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  mock.method(console, "warn", () => {});
  assert.deepStrictEqual(await loadRemotePatches(), []);
  assert.strictEqual(fetch.mock.callCount(), 0);
});
