/**
 * Baseline signature verification, shared by `check` and the deprecated `ci`.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import type { MCPContractSnapshot } from "@mcp-contracts/core";
import { parseSignatureFile, verifySignature } from "@mcp-contracts/core";
import { deriveSignaturePath } from "./commands/sign.js";

/**
 * Verifies the baseline snapshot's signature before diffing.
 *
 * @param baseline - The parsed baseline snapshot.
 * @param baselinePath - File path to the baseline (used to derive sig path).
 * @param signatureKeyOption - The --signature-key option value, if provided.
 * @param quiet - Whether to suppress non-essential output.
 */
export function verifyBaselineSignature(
  baseline: MCPContractSnapshot,
  baselinePath: string,
  signatureKeyOption: string | undefined,
  quiet: boolean,
): void {
  const keyPem = resolveSignatureKey(signatureKeyOption);
  const sigPath = deriveSignaturePath(baselinePath);

  let sigJson: string;
  try {
    sigJson = readFileSync(sigPath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read baseline signature file "${sigPath}": ${message}`);
  }

  const sig = parseSignatureFile(sigJson);
  const result = verifySignature(baseline, sig, keyPem);

  if (!result.valid) {
    throw new Error(`Baseline signature verification failed: ${result.error}`);
  }

  if (!quiet) {
    process.stderr.write("Baseline signature verified\n");
  }
}

/**
 * Resolves the public key PEM for signature verification.
 *
 * Checks the `--signature-key` option first, then the `MCP_SIGNATURE_KEY`
 * environment variable. The env var can contain PEM content directly
 * (starts with "-----BEGIN") or a file path.
 *
 * @param optionValue - The --signature-key option value, if provided.
 * @returns The PEM string for the public key.
 */
function resolveSignatureKey(optionValue: string | undefined): string {
  if (optionValue) {
    if (!isAbsolute(optionValue) || resolve(optionValue).startsWith(`${process.cwd()}${sep}`)) {
      process.stderr.write(
        "Warning: --signature-key points inside the working tree. In CI, supply the public key " +
          "from a secret (MCP_SIGNATURE_KEY), otherwise a pull request can replace key, baseline " +
          "and signature together.\n",
      );
    }
    try {
      return readFileSync(optionValue, "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read signature key file "${optionValue}": ${message}`);
    }
  }

  const envValue = process.env["MCP_SIGNATURE_KEY"];
  if (envValue) {
    if (envValue.startsWith("-----BEGIN")) {
      return envValue;
    }
    try {
      return readFileSync(envValue, "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read key from MCP_SIGNATURE_KEY path "${envValue}": ${message}`);
    }
  }

  throw new Error(
    "--verify-signature requires --signature-key <path> or MCP_SIGNATURE_KEY environment variable",
  );
}
