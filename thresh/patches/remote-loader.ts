import type { Patch, RemotePatchManifest } from "../shared/types.js";

/**
 * patches/remote-loader.ts — Remote Patch Marketplace loader
 *
 * Fetches patch manifests from PATCH_REGISTRY_URL, applies trust and version
 * filters, then evaluates each manifest's `code` string into a live `Patch`
 * object.
 *
 * ⚠️  Security note: evaluating remote code via `new Function` is inherently
 * risky.  Future hardening should replace this with sandbox/VM execution or a
 * purpose-built patch DSL.  For now, only patches with a "verified" or
 * "community" trust level (as declared by the marketplace) are loaded, and the
 * caller must ensure PATCH_REGISTRY_URL points to a trusted endpoint.
 */

// ─── Filters ──────────────────────────────────────────────────────────────────

const ACCEPTED_TRUST_LEVELS: ReadonlySet<RemotePatchManifest["trust"]> = new Set([
  "verified",
  "community",
]);

/** Major version prefix the agent currently supports. */
const COMPATIBLE_VERSION_PREFIX = "1.";

function isTrusted(manifest: RemotePatchManifest): boolean {
  return ACCEPTED_TRUST_LEVELS.has(manifest.trust);
}

function isCompatible(manifest: RemotePatchManifest): boolean {
  return manifest.version.startsWith(COMPATIBLE_VERSION_PREFIX);
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Evaluates a manifest's `code` string into a `Patch` object.
 * Supports both `export default { … }` style (wrapped module) and bare objects.
 */
function evalPatch(manifest: RemotePatchManifest): Patch {
  // eslint-disable-next-line no-new-func
  const mod = new Function(`return ${manifest.code}`)() as
    | { default?: Patch }
    | Patch;
  const patch = (mod as { default?: Patch }).default ?? (mod as Patch);

  if (typeof patch.detect !== "function" || typeof patch.apply !== "function") {
    throw new Error(
      `Patch ${manifest.id} does not implement the Patch interface (missing detect/apply).`
    );
  }

  return patch;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches remote patch manifests from the marketplace URL configured via the
 * `PATCH_REGISTRY_URL` environment variable.
 *
 * Returns an empty array when:
 *   - `PATCH_REGISTRY_URL` is not set.
 *   - The registry is unreachable.
 *   - A manifest fails trust/version/eval checks (that manifest is skipped).
 *
 * Never throws — all errors are logged as warnings so a registry outage cannot
 * break the core agent loop.
 */
export async function loadRemotePatches(): Promise<Patch[]> {
  const registryUrl = process.env.PATCH_REGISTRY_URL;
  if (!registryUrl) {
    return [];
  }

  let manifests: RemotePatchManifest[];

  try {
    const res = await fetch(registryUrl);
    if (!res.ok) {
      console.warn(
        `[thresh/remote-loader] Registry responded with HTTP ${res.status} — skipping remote patches.`
      );
      return [];
    }
    manifests = (await res.json()) as RemotePatchManifest[];
  } catch (err) {
    console.warn("[thresh/remote-loader] Failed to reach patch registry:", err);
    return [];
  }

  const patches: Patch[] = [];

  for (const manifest of manifests) {
    if (!isTrusted(manifest)) {
      console.log(
        `[thresh/remote-loader] Skipping untrusted patch "${manifest.id}" (trust=${manifest.trust}).`
      );
      continue;
    }

    if (!isCompatible(manifest)) {
      console.log(
        `[thresh/remote-loader] Skipping incompatible patch "${manifest.id}" (version=${manifest.version}).`
      );
      continue;
    }

    try {
      patches.push(evalPatch(manifest));
      console.log(
        `[thresh/remote-loader] Loaded remote patch "${manifest.id}" v${manifest.version}.`
      );
    } catch (err) {
      console.warn(
        `[thresh/remote-loader] Failed to evaluate patch "${manifest.id}":`,
        err
      );
    }
  }

  return patches;
}
