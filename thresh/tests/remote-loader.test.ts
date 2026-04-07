import { jest, describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import { loadRemotePatches } from "../patches/remote-loader.js";
import type { RemotePatchManifest } from "../shared/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid patch code string (bare object, no `export default`). */
const VALID_PATCH_CODE = `{
  id: "remote/noop",
  name: "Noop patch",
  detect() { return false; },
  apply() { throw new Error("should never be called"); }
}`;

function makeManifest(overrides: Partial<RemotePatchManifest> = {}): RemotePatchManifest {
  return {
    id: "remote/noop",
    version: "1.0.0",
    description: "A no-op test patch",
    trust: "verified",
    code: VALID_PATCH_CODE,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loadRemotePatches", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Reset fetch mock between tests
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns an empty array when PATCH_REGISTRY_URL is not set", async () => {
    delete process.env.PATCH_REGISTRY_URL;
    const patches = await loadRemotePatches();
    expect(patches).toEqual([]);
  });

  it("returns an empty array and warns when fetch fails", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new Error("network error"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const patches = await loadRemotePatches();

    expect(patches).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to reach patch registry"),
      expect.any(Error)
    );
  });

  it("returns an empty array and warns when registry returns a non-OK status", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 503 })
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const patches = await loadRemotePatches();

    expect(patches).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("HTTP 503")
    );
  });

  it("filters out patches with 'experimental' trust level", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([makeManifest({ trust: "experimental" })]))
    );
    jest.spyOn(console, "log").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toEqual([]);
  });

  it("loads patches with 'verified' trust level", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([makeManifest({ trust: "verified" })]))
    );
    jest.spyOn(console, "log").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toHaveLength(1);
    expect(patches[0].id).toBe("remote/noop");
  });

  it("loads patches with 'community' trust level", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([makeManifest({ trust: "community" })]))
    );
    jest.spyOn(console, "log").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toHaveLength(1);
  });

  it("filters out patches whose version is not 1.x", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([makeManifest({ version: "2.0.0" })]))
    );
    jest.spyOn(console, "log").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toEqual([]);
  });

  it("skips malformed patch code and warns", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    const bad = makeManifest({ code: "THIS IS NOT VALID JS {{{{" });
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([bad]))
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to evaluate patch"),
      expect.anything()
    );
  });

  it("skips patches missing detect/apply and warns", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    const incomplete = makeManifest({ code: `{ id: "bad", name: "bad" }` });
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([incomplete]))
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to evaluate patch"),
      expect.anything()
    );
  });

  it("evaluates patches exported as { default: Patch }", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    const wrappedCode = `{ default: { id: "remote/wrapped", name: "Wrapped", detect() { return false; }, apply() { throw new Error(); } } }`;
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([makeManifest({ code: wrappedCode })]))
    );
    jest.spyOn(console, "log").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toHaveLength(1);
    expect(patches[0].id).toBe("remote/wrapped");
  });

  it("loads multiple valid patches from the registry", async () => {
    process.env.PATCH_REGISTRY_URL = "https://example.invalid/patches";
    const first = makeManifest({ id: "remote/a", code: VALID_PATCH_CODE.replace("remote/noop", "remote/a") });
    const second = makeManifest({ id: "remote/b", code: VALID_PATCH_CODE.replace("remote/noop", "remote/b") });
    const third = makeManifest({ id: "remote/c", trust: "experimental" }); // filtered out
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([first, second, third]))
    );
    jest.spyOn(console, "log").mockImplementation(() => {});

    const patches = await loadRemotePatches();
    expect(patches).toHaveLength(2);
    expect(patches.map((p) => p.id)).toEqual(["remote/a", "remote/b"]);
  });
});
