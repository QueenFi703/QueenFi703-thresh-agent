import type { Patch } from "../shared/types.js";
import { linuxRunnerPatch } from "./github-actions/linux-runner.js";
import { permissionsPatch } from "./github-actions/permissions.js";
import { loadRemotePatches } from "./remote-loader.js";

/**
 * Patch registry
 *
 * Local (built-in) patches are always loaded first and treated as fully trusted.
 * Remote patches from the marketplace are appended afterward.
 *
 * To add a new local patch:
 *   1. Implement the `Patch` interface in `./github-actions/<your-patch>.ts`
 *   2. Import it here and add it to the `LOCAL_PATCHES` array.
 *
 * Example:
 *
 *   import { myPatch } from "./github-actions/my-patch.js";
 *   // Then add `myPatch` to the array below.
 */

/**
 * Built-in, always-trusted local patches.
 *
 * @deprecated Prefer `loadPatches()` which merges local and remote patches.
 *   This export is kept for backward compatibility and direct unit testing.
 */
export const PATCHES: Patch[] = [
  linuxRunnerPatch,
  permissionsPatch,
];

/**
 * Returns the full ordered patch list: local patches first, then any remote
 * patches fetched from the marketplace (PATCH_REGISTRY_URL).
 *
 * Remote patches are silently skipped when the registry is unavailable or when
 * a patch fails trust / version / eval checks — a registry outage never breaks
 * the core agent loop.
 */
export async function loadPatches(): Promise<Patch[]> {
  const remote = await loadRemotePatches();
  return [
    ...PATCHES, // local (trusted core)
    ...remote,  // remote (marketplace)
  ];
}
