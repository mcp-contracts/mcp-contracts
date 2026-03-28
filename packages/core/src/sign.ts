/**
 * Snapshot signing and verification using Ed25519 or RSA-PSS-SHA256.
 *
 * The signature covers the `contentHash` field of a snapshot, which itself
 * is a SHA-256 hash of the canonical tools/resources/prompts content.
 * Signatures are stored as detached `.mcpc.sig` JSON files.
 *
 * @see MILESTONES.md v0.4.0 for the design rationale.
 */

import { constants, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { computeContentHash } from "./hash.js";
import type {
  DetachedSignature,
  SignatureAlgorithm,
  VerifyHashResult,
  VerifySignatureResult,
} from "./sign-types.js";
import { SIGNATURE_VERSION } from "./sign-types.js";
import type { MCPContractSnapshot } from "./types.js";

/**
 * Detects the cryptographic algorithm from a PEM-encoded key.
 *
 * @param keyPem - PEM-encoded public or private key.
 * @returns The detected signature algorithm.
 */
export function detectKeyAlgorithm(keyPem: string): SignatureAlgorithm {
  const keyObject = keyPem.includes("PRIVATE") ? createPrivateKey(keyPem) : createPublicKey(keyPem);

  switch (keyObject.asymmetricKeyType) {
    case "ed25519":
      return "Ed25519";
    case "rsa":
      return "RSA-PSS-SHA256";
    default:
      throw new Error(
        `Unsupported key type "${keyObject.asymmetricKeyType}". Supported types: Ed25519, RSA`,
      );
  }
}

/**
 * Signs a snapshot's content hash with a private key.
 *
 * @param contentHash - The content hash to sign (must start with "sha256:").
 * @param privateKeyPem - PEM-encoded private key (Ed25519 or RSA).
 * @returns A detached signature object.
 */
export function signContentHash(contentHash: string, privateKeyPem: string): DetachedSignature {
  if (!contentHash.startsWith("sha256:")) {
    throw new Error(`Invalid contentHash format: expected "sha256:..." but got "${contentHash}"`);
  }

  const algorithm = detectKeyAlgorithm(privateKeyPem);
  const data = Buffer.from(contentHash, "utf-8");
  const privateKey = createPrivateKey(privateKeyPem);

  let signatureBytes: Buffer;
  if (algorithm === "Ed25519") {
    signatureBytes = sign(null, data, privateKey);
  } else {
    signatureBytes = sign("sha256", data, {
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
    });
  }

  return {
    signatureVersion: SIGNATURE_VERSION,
    algorithm,
    contentHash,
    signature: signatureBytes.toString("base64"),
    signedAt: new Date().toISOString(),
  };
}

/**
 * Verifies a detached signature against a snapshot and public key.
 *
 * Performs three checks in order:
 * 1. Recomputed content hash matches the snapshot's stored hash.
 * 2. Snapshot's content hash matches the signature's content hash.
 * 3. Cryptographic signature is valid.
 *
 * @param snapshot - The snapshot to verify.
 * @param signature - The detached signature to verify against.
 * @param publicKeyPem - PEM-encoded public key.
 * @returns Structured verification result.
 */
export function verifySignature(
  snapshot: MCPContractSnapshot,
  signature: DetachedSignature,
  publicKeyPem: string,
): VerifySignatureResult {
  // Step 1: Recompute content hash
  const recomputed = computeContentHash(snapshot.tools, snapshot.resources, snapshot.prompts);
  if (recomputed !== snapshot.contentHash) {
    return {
      valid: false,
      error: `Content hash mismatch: stored "${snapshot.contentHash}" but recomputed "${recomputed}"`,
      contentHashMatch: false,
      signatureMatch: false,
    };
  }

  // Step 2: Check signature references the same hash
  if (snapshot.contentHash !== signature.contentHash) {
    return {
      valid: false,
      error: `Signature was created for hash "${signature.contentHash}" but snapshot has "${snapshot.contentHash}"`,
      contentHashMatch: true,
      signatureMatch: false,
    };
  }

  // Step 3: Verify cryptographic signature
  const data = Buffer.from(signature.contentHash, "utf-8");
  const signatureBytes = Buffer.from(signature.signature, "base64");
  const publicKey = createPublicKey(publicKeyPem);

  let isValid: boolean;
  if (signature.algorithm === "Ed25519") {
    isValid = verify(null, data, publicKey, signatureBytes);
  } else if (signature.algorithm === "RSA-PSS-SHA256") {
    isValid = verify(
      "sha256",
      data,
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
      },
      signatureBytes,
    );
  } else {
    return {
      valid: false,
      error: `Unsupported signature algorithm "${signature.algorithm}"`,
      contentHashMatch: true,
      signatureMatch: false,
    };
  }

  if (!isValid) {
    return {
      valid: false,
      error: "Cryptographic signature verification failed",
      contentHashMatch: true,
      signatureMatch: false,
    };
  }

  return { valid: true, contentHashMatch: true, signatureMatch: true };
}

/**
 * Verifies a snapshot's content hash by recomputing it.
 *
 * @param snapshot - The snapshot to verify.
 * @returns Result with the expected (stored) and actual (recomputed) hashes.
 */
export function verifyContentHash(snapshot: MCPContractSnapshot): VerifyHashResult {
  const actual = computeContentHash(snapshot.tools, snapshot.resources, snapshot.prompts);
  return {
    valid: actual === snapshot.contentHash,
    expected: snapshot.contentHash,
    actual,
  };
}

/**
 * Parses and validates a `.mcpc.sig` JSON string into a DetachedSignature.
 *
 * @param json - The raw JSON string from a `.mcpc.sig` file.
 * @returns The parsed DetachedSignature.
 */
export function parseSignatureFile(json: string): DetachedSignature {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON in signature file");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Signature file must contain a JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (obj["signatureVersion"] !== SIGNATURE_VERSION) {
    throw new Error(
      `Unsupported signature version "${String(obj["signatureVersion"])}" (expected "${SIGNATURE_VERSION}")`,
    );
  }

  if (typeof obj["algorithm"] !== "string") {
    throw new Error('Signature file is missing "algorithm"');
  }

  if (obj["algorithm"] !== "Ed25519" && obj["algorithm"] !== "RSA-PSS-SHA256") {
    throw new Error(`Unsupported algorithm "${obj["algorithm"]}" in signature file`);
  }

  if (typeof obj["contentHash"] !== "string" || !obj["contentHash"].startsWith("sha256:")) {
    throw new Error('Signature file has invalid "contentHash"');
  }

  if (typeof obj["signature"] !== "string" || obj["signature"].length === 0) {
    throw new Error('Signature file is missing "signature"');
  }

  if (typeof obj["signedAt"] !== "string") {
    throw new Error('Signature file is missing "signedAt"');
  }

  return data as DetachedSignature;
}
