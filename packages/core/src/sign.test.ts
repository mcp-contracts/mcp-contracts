import { generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { computeContentHash } from "./hash.js";
import {
  detectKeyAlgorithm,
  parseSignatureFile,
  signContentHash,
  verifyContentHash,
  verifySignature,
} from "./sign.js";
import type { DetachedSignature } from "./sign-types.js";
import type { MCPContractSnapshot } from "./types.js";

let ed25519Private: string;
let ed25519Public: string;
let rsaPrivate: string;
let rsaPublic: string;

beforeAll(() => {
  const ed = generateKeyPairSync("ed25519");
  ed25519Private = ed.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  ed25519Public = ed.publicKey.export({ type: "spki", format: "pem" }) as string;

  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  rsaPrivate = rsa.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  rsaPublic = rsa.publicKey.export({ type: "spki", format: "pem" }) as string;
});

function makeSnapshot(overrides?: Partial<MCPContractSnapshot>): MCPContractSnapshot {
  const tools = { test: { description: "A test tool", inputSchema: { type: "object" } } };
  const resources = {};
  const prompts = {};
  const contentHash = computeContentHash(tools, resources, prompts);
  return {
    snapshotVersion: "1.0.0",
    capturedAt: "2026-03-28T00:00:00.000Z",
    contentHash,
    server: { name: "test", version: "1.0.0", protocolVersion: "2025-03-26", capabilities: {} },
    capture: { transport: "stdio", tool: "mcpdiff/0.4.0" },
    tools,
    resources,
    prompts,
    ...overrides,
  };
}

describe("detectKeyAlgorithm", () => {
  it("detects Ed25519 private key", () => {
    expect(detectKeyAlgorithm(ed25519Private)).toBe("Ed25519");
  });

  it("detects Ed25519 public key", () => {
    expect(detectKeyAlgorithm(ed25519Public)).toBe("Ed25519");
  });

  it("detects RSA private key", () => {
    expect(detectKeyAlgorithm(rsaPrivate)).toBe("RSA-PSS-SHA256");
  });

  it("detects RSA public key", () => {
    expect(detectKeyAlgorithm(rsaPublic)).toBe("RSA-PSS-SHA256");
  });

  it("throws for invalid PEM", () => {
    expect(() => detectKeyAlgorithm("not a key")).toThrow();
  });
});

describe("signContentHash", () => {
  it("produces a valid Ed25519 signature", () => {
    const sig = signContentHash("sha256:abc123", ed25519Private);
    expect(sig.signatureVersion).toBe("1.0.0");
    expect(sig.algorithm).toBe("Ed25519");
    expect(sig.contentHash).toBe("sha256:abc123");
    expect(sig.signature).toBeTruthy();
    expect(sig.signedAt).toBeTruthy();
  });

  it("produces a valid RSA signature", () => {
    const sig = signContentHash("sha256:abc123", rsaPrivate);
    expect(sig.algorithm).toBe("RSA-PSS-SHA256");
    expect(sig.signature).toBeTruthy();
  });

  it("rejects invalid contentHash format", () => {
    expect(() => signContentHash("md5:abc", ed25519Private)).toThrow("Invalid contentHash format");
  });

  it("rejects a public key as private key", () => {
    expect(() => signContentHash("sha256:abc", ed25519Public)).toThrow();
  });
});

describe("verifySignature", () => {
  it("succeeds for valid Ed25519 round-trip", () => {
    const snapshot = makeSnapshot();
    const sig = signContentHash(snapshot.contentHash, ed25519Private);
    const result = verifySignature(snapshot, sig, ed25519Public);
    expect(result.valid).toBe(true);
    expect(result.contentHashMatch).toBe(true);
    expect(result.signatureMatch).toBe(true);
  });

  it("succeeds for valid RSA round-trip", () => {
    const snapshot = makeSnapshot();
    const sig = signContentHash(snapshot.contentHash, rsaPrivate);
    const result = verifySignature(snapshot, sig, rsaPublic);
    expect(result.valid).toBe(true);
  });

  it("fails when snapshot content is tampered", () => {
    const snapshot = makeSnapshot();
    const sig = signContentHash(snapshot.contentHash, ed25519Private);
    // Tamper with tools after signing
    const tool = snapshot.tools["test"];
    if (tool) tool.description = "TAMPERED";
    const result = verifySignature(snapshot, sig, ed25519Public);
    expect(result.valid).toBe(false);
    expect(result.contentHashMatch).toBe(false);
    expect(result.error).toContain("Content hash mismatch");
  });

  it("fails when signature references a different hash", () => {
    const snapshot = makeSnapshot();
    const sig = signContentHash(snapshot.contentHash, ed25519Private);
    // Change the stored hash to simulate a different snapshot
    const tamperedSig: DetachedSignature = { ...sig, contentHash: "sha256:different" };
    const result = verifySignature(snapshot, tamperedSig, ed25519Public);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Signature was created for hash");
  });

  it("fails with wrong public key", () => {
    const snapshot = makeSnapshot();
    const sig = signContentHash(snapshot.contentHash, ed25519Private);
    // Use RSA public key to verify Ed25519 signature
    const otherEd = generateKeyPairSync("ed25519");
    const wrongPublic = otherEd.publicKey.export({ type: "spki", format: "pem" }) as string;
    const result = verifySignature(snapshot, sig, wrongPublic);
    expect(result.valid).toBe(false);
    expect(result.signatureMatch).toBe(false);
  });

  it("fails with tampered signature bytes", () => {
    const snapshot = makeSnapshot();
    const sig = signContentHash(snapshot.contentHash, ed25519Private);
    const tampered: DetachedSignature = { ...sig, signature: "aW52YWxpZA==" };
    const result = verifySignature(snapshot, tampered, ed25519Public);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cryptographic signature verification failed");
  });
});

describe("verifyContentHash", () => {
  it("passes for a valid snapshot", () => {
    const snapshot = makeSnapshot();
    const result = verifyContentHash(snapshot);
    expect(result.valid).toBe(true);
    expect(result.expected).toBe(result.actual);
  });

  it("fails for a tampered snapshot", () => {
    const snapshot = makeSnapshot();
    const tool = snapshot.tools["test"];
    if (tool) tool.description = "TAMPERED";
    const result = verifyContentHash(snapshot);
    expect(result.valid).toBe(false);
    expect(result.expected).not.toBe(result.actual);
  });
});

describe("parseSignatureFile", () => {
  it("parses a valid signature file", () => {
    const snapshot = makeSnapshot();
    const sig = signContentHash(snapshot.contentHash, ed25519Private);
    const json = JSON.stringify(sig, null, 2);
    const parsed = parseSignatureFile(json);
    expect(parsed.signatureVersion).toBe("1.0.0");
    expect(parsed.algorithm).toBe("Ed25519");
    expect(parsed.contentHash).toBe(snapshot.contentHash);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseSignatureFile("not json")).toThrow("Invalid JSON");
  });

  it("rejects non-object JSON", () => {
    expect(() => parseSignatureFile("[]")).toThrow("must contain a JSON object");
  });

  it("rejects wrong signature version", () => {
    expect(() => parseSignatureFile('{"signatureVersion":"2.0.0"}')).toThrow(
      "Unsupported signature version",
    );
  });

  it("rejects missing algorithm", () => {
    expect(() => parseSignatureFile('{"signatureVersion":"1.0.0"}')).toThrow('missing "algorithm"');
  });

  it("rejects unsupported algorithm", () => {
    const json = JSON.stringify({
      signatureVersion: "1.0.0",
      algorithm: "DSA",
      contentHash: "sha256:abc",
      signature: "data",
      signedAt: "2026-01-01",
    });
    expect(() => parseSignatureFile(json)).toThrow('Unsupported algorithm "DSA"');
  });

  it("rejects missing contentHash", () => {
    const json = JSON.stringify({
      signatureVersion: "1.0.0",
      algorithm: "Ed25519",
    });
    expect(() => parseSignatureFile(json)).toThrow('invalid "contentHash"');
  });

  it("rejects empty signature", () => {
    const json = JSON.stringify({
      signatureVersion: "1.0.0",
      algorithm: "Ed25519",
      contentHash: "sha256:abc",
      signature: "",
      signedAt: "2026-01-01",
    });
    expect(() => parseSignatureFile(json)).toThrow('missing "signature"');
  });

  it("rejects missing signedAt", () => {
    const json = JSON.stringify({
      signatureVersion: "1.0.0",
      algorithm: "Ed25519",
      contentHash: "sha256:abc",
      signature: "data",
    });
    expect(() => parseSignatureFile(json)).toThrow('missing "signedAt"');
  });
});
