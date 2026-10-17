import type { Patch } from "../shared/types.js";

/** Remote JavaScript is disabled: registry trust labels do not authenticate code.
 * Keep this API so callers can continue using the built-in patch registry.
 */
export async function loadRemotePatches(): Promise<Patch[]> {
  if (process.env.PATCH_REGISTRY_URL) {
    console.warn("[thresh/remote-loader] Remote executable patches are disabled. Review and bundle patches locally.");
  }
  return [];
}
