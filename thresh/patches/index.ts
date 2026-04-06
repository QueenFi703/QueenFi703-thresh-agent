import type { Patch } from "../shared/types.js";
import { linuxRunnerPatch } from "./github-actions/linux-runner.js";
import { permissionsPatch } from "./github-actions/permissions.js";

/**
 * Patch registry
 *
 * All patches are evaluated in order.  To add a new patch:
 *   1. Implement the `Patch` interface in `./github-actions/<your-patch>.ts`
 *   2. Import it here and add it to the `PATCHES` array.
 *
 * Example:
 *
 *   import { myPatch } from "./github-actions/my-patch.js";
 *   // Then add `myPatch` to the array below.
 */
export const PATCHES: Patch[] = [
  linuxRunnerPatch,
  permissionsPatch,
];
