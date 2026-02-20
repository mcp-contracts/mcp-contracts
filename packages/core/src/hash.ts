import { createHash } from "node:crypto";
import type { PromptContract, ResourceContract, ToolContract } from "./types.js";

/**
 * Recursively sorts all object keys alphabetically at every level.
 *
 * @param value - Any JSON-compatible value.
 * @returns The same value with all object keys sorted alphabetically.
 */
export function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Computes a content hash for the contract-relevant fields of a snapshot.
 *
 * The hash is computed per SPEC.md section 1.5:
 * 1. Create a JSON object with keys `tools`, `resources`, `prompts` (in that order).
 * 2. Serialize with `JSON.stringify()` using sorted keys at every level.
 * 3. Compute SHA-256 of the resulting UTF-8 string.
 * 4. Return `"sha256:<hex>"`.
 *
 * This ensures two snapshots with identical tool/resource/prompt definitions
 * always produce the same hash, regardless of capture metadata.
 *
 * @param tools - Tools record, keyed by tool name.
 * @param resources - Resources record, keyed by resource URI.
 * @param prompts - Prompts record, keyed by prompt name.
 * @returns The content hash in `"sha256:<hex>"` format.
 */
export function computeContentHash(
  tools: Record<string, ToolContract>,
  resources: Record<string, ResourceContract>,
  prompts: Record<string, PromptContract>,
): string {
  const content = { tools, resources, prompts };
  const canonical = JSON.stringify(sortKeys(content));
  const hash = createHash("sha256").update(canonical, "utf-8").digest("hex");
  return `sha256:${hash}`;
}
