import { jest, it, expect, afterEach } from "@jest/globals";
import { loadRemotePatches } from "../patches/remote-loader.js";
const original = process.env.PATCH_REGISTRY_URL;
afterEach(() => { if (original === undefined) delete process.env.PATCH_REGISTRY_URL; else process.env.PATCH_REGISTRY_URL = original; jest.restoreAllMocks(); });
it("returns built-in-only behavior when no registry is configured", async () => {
  delete process.env.PATCH_REGISTRY_URL;
  expect(await loadRemotePatches()).toEqual([]);
});
it("does not fetch or execute remote code even with a configured registry", async () => {
  process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("must not fetch"); });
  jest.spyOn(console, "warn").mockImplementation(() => {});
  expect(await loadRemotePatches()).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
