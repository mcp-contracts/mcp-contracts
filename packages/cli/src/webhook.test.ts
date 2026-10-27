import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { WebhookPayload } from "@mcp-contracts/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sendWebhook, signWebhookBody } from "./webhook.js";

/** Minimal webhook payload for testing. */
function makePayload(): WebhookPayload {
  return {
    event: "diff.completed",
    timestamp: "2026-01-01T00:00:00.000Z",
    source: { trigger: "cli" },
    report: {
      meta: {
        before: {
          serverName: "a",
          serverVersion: "1.0.0",
          contentHash: "sha256:aaa",
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
        after: {
          serverName: "a",
          serverVersion: "1.1.0",
          contentHash: "sha256:bbb",
          capturedAt: "2026-01-02T00:00:00.000Z",
        },
        generatedAt: "2026-01-02T00:00:00.000Z",
        tool: "mcpdiff",
      },
      summary: { breaking: 0, warning: 0, safe: 0, total: 0 },
      changes: [],
    },
  };
}

describe("sendWebhook", () => {
  let server: Server;
  let port: number;
  let lastBody: string;
  let lastContentType: string | undefined;
  let lastSignature: string | undefined;
  let responseCode: number;
  let redirectTo: string | undefined;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        responseCode = 200;
        server = createServer((req: IncomingMessage, res: ServerResponse) => {
          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", () => {
            lastBody = body;
            lastContentType = req.headers["content-type"];
            lastSignature = req.headers["x-mcp-signature"] as string | undefined;
            if (redirectTo) {
              res.writeHead(307, { Location: redirectTo });
            } else {
              res.writeHead(responseCode);
            }
            res.end();
          });
        });
        server.listen(0, () => {
          const addr = server.address();
          port = typeof addr === "object" && addr ? addr.port : 0;
          resolve();
        });
      }),
  );

  afterEach(() => {
    lastBody = "";
    lastContentType = undefined;
    lastSignature = undefined;
    responseCode = 200;
    redirectTo = undefined;
  });

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  );

  it("sends POST with JSON payload and returns success", async () => {
    const result = await sendWebhook(`http://localhost:${port}/webhook`, makePayload());

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
    expect(lastContentType).toBe("application/json");

    const parsed = JSON.parse(lastBody);
    expect(parsed.event).toBe("diff.completed");
    expect(parsed.report).toBeDefined();
  });

  it("returns failure on non-2xx status", async () => {
    responseCode = 500;
    const result = await sendWebhook(`http://localhost:${port}/webhook`, makePayload());

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toContain("500");
  });

  it("returns failure on connection error", async () => {
    const result = await sendWebhook("http://localhost:1/webhook", makePayload());

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.statusCode).toBeUndefined();
  });

  it("never throws", async () => {
    const result = await sendWebhook("http://invalid-host-that-does-not-exist:9999", makePayload());

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("respects timeout", async () => {
    // Use a port that will hang
    const result = await sendWebhook("http://10.255.255.1:9999/webhook", makePayload(), {
      timeoutMs: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("signs the body when a secret is given", async () => {
    const payload = makePayload();
    const result = await sendWebhook(`http://127.0.0.1:${port}/hook`, payload, {
      secret: "s3cret",
    });
    expect(result.success).toBe(true);
    expect(lastSignature).toBe(signWebhookBody("s3cret", JSON.stringify(payload)));
    expect(lastSignature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("sends no signature header without a secret", async () => {
    await sendWebhook(`http://127.0.0.1:${port}/hook`, makePayload(), { secret: undefined });
    expect(lastSignature).toBeUndefined();
  });

  it("refuses plain http to a non-loopback host", async () => {
    const result = await sendWebhook("http://webhooks.example.invalid/hook", makePayload(), {
      allowInsecure: false,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("plain http");
    expect(result.error).toContain("MCP_WEBHOOK_ALLOW_INSECURE");
  });

  it("allows plain http to a non-loopback host when explicitly permitted", async () => {
    // The host does not resolve, so the failure is a network error, not the policy.
    const result = await sendWebhook("http://webhooks.example.invalid/hook", makePayload(), {
      allowInsecure: true,
      timeoutMs: 2000,
    });
    expect(result.success).toBe(false);
    expect(result.error).not.toContain("plain http");
  });

  it("rejects unsupported schemes", async () => {
    const result = await sendWebhook("ftp://example.com/hook", makePayload());
    expect(result.error).toContain("Unsupported webhook URL scheme");
  });

  it("does not follow redirects", async () => {
    redirectTo = `http://127.0.0.1:${port}/elsewhere`;
    const result = await sendWebhook(`http://127.0.0.1:${port}/hook`, makePayload());
    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain("redirect");
  });
});
