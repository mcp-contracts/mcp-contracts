/**
 * Types for MCP contract snapshot signing and verification.
 *
 * Defines the detached signature format (`.mcpc.sig`) and result types
 * for signing, signature verification, and content hash verification.
 */

/** Supported cryptographic algorithms for snapshot signing. */
export type SignatureAlgorithm = "Ed25519" | "RSA-PSS-SHA256";

/** The current signature file format version. */
export const SIGNATURE_VERSION = "1.0.0" as const;

/**
 * A detached signature for an MCP contract snapshot.
 *
 * Stored as a `.mcpc.sig` JSON file alongside the `.mcpc.json` snapshot.
 * The signature covers the `contentHash` field, which itself is a SHA-256
 * of the canonical tools/resources/prompts content.
 */
export interface DetachedSignature {
  /** Format version for the signature file. Currently "1.0.0". */
  signatureVersion: typeof SIGNATURE_VERSION;
  /** The cryptographic algorithm used to create the signature. */
  algorithm: SignatureAlgorithm;
  /** The contentHash that was signed (binding reference to the snapshot). */
  contentHash: string;
  /** Base64-encoded signature bytes. */
  signature: string;
  /** ISO 8601 timestamp of when the signature was created. */
  signedAt: string;
}

/** Result of verifying a cryptographic signature against a snapshot. */
export interface VerifySignatureResult {
  /** Whether the overall verification passed. */
  valid: boolean;
  /** Human-readable error message if verification failed. */
  error?: string;
  /** Whether the recomputed content hash matches the snapshot's stored hash. */
  contentHashMatch?: boolean;
  /** Whether the cryptographic signature is valid. */
  signatureMatch?: boolean;
}

/** Result of verifying a snapshot's content hash. */
export interface VerifyHashResult {
  /** Whether the stored hash matches the recomputed hash. */
  valid: boolean;
  /** The hash stored in the snapshot file. */
  expected: string;
  /** The hash recomputed from the snapshot's tools, resources, and prompts. */
  actual: string;
}
