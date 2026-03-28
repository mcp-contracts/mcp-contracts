import { describe, expect, it } from "vitest";
import type {
  DetachedSignature,
  SignatureAlgorithm,
  VerifyHashResult,
  VerifySignatureResult,
} from "./sign-types.js";
import { SIGNATURE_VERSION } from "./sign-types.js";

describe("SIGNATURE_VERSION", () => {
  it("is 1.0.0", () => {
    expect(SIGNATURE_VERSION).toBe("1.0.0");
  });
});

describe("SignatureAlgorithm", () => {
  it("accepts Ed25519 and RSA-PSS-SHA256", () => {
    const ed: SignatureAlgorithm = "Ed25519";
    const rsa: SignatureAlgorithm = "RSA-PSS-SHA256";
    expect(ed).toBe("Ed25519");
    expect(rsa).toBe("RSA-PSS-SHA256");
  });
});

describe("DetachedSignature", () => {
  it("can be constructed with all required fields", () => {
    const sig: DetachedSignature = {
      signatureVersion: "1.0.0",
      algorithm: "Ed25519",
      contentHash: "sha256:abc123",
      signature: "base64data",
      signedAt: "2026-03-28T00:00:00.000Z",
    };
    expect(sig.signatureVersion).toBe(SIGNATURE_VERSION);
    expect(sig.algorithm).toBe("Ed25519");
    expect(sig.contentHash).toBe("sha256:abc123");
    expect(sig.signature).toBe("base64data");
    expect(sig.signedAt).toBe("2026-03-28T00:00:00.000Z");
  });
});

describe("VerifySignatureResult", () => {
  it("represents a successful verification", () => {
    const result: VerifySignatureResult = {
      valid: true,
      contentHashMatch: true,
      signatureMatch: true,
    };
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("represents a failed verification with error", () => {
    const result: VerifySignatureResult = {
      valid: false,
      error: "Signature does not match",
      contentHashMatch: true,
      signatureMatch: false,
    };
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Signature does not match");
  });
});

describe("VerifyHashResult", () => {
  it("represents a matching hash", () => {
    const result: VerifyHashResult = {
      valid: true,
      expected: "sha256:abc",
      actual: "sha256:abc",
    };
    expect(result.valid).toBe(true);
    expect(result.expected).toBe(result.actual);
  });

  it("represents a mismatched hash", () => {
    const result: VerifyHashResult = {
      valid: false,
      expected: "sha256:abc",
      actual: "sha256:def",
    };
    expect(result.valid).toBe(false);
    expect(result.expected).not.toBe(result.actual);
  });
});
