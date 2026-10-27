import { createHmac } from "node:crypto";
import type { WebhookPayload } from "@mcp-contracts/core";

/** Environment variable holding the shared secret used to sign payloads. */
export const WEBHOOK_SECRET_ENV = "MCP_WEBHOOK_SECRET";

/** Environment variable that permits plain-http webhooks to non-loopback hosts. */
export const WEBHOOK_ALLOW_INSECURE_ENV = "MCP_WEBHOOK_ALLOW_INSECURE";

/** Header carrying the HMAC-SHA256 signature of the request body. */
export const WEBHOOK_SIGNATURE_HEADER = "X-MCP-Signature";

/** Options for sending a webhook. */
export interface WebhookOptions {
  /** Timeout in milliseconds. Defaults to 10000. */
  timeoutMs?: number;
  /** Shared secret for signing. Defaults to the MCP_WEBHOOK_SECRET environment variable. */
  secret?: string;
  /** Allow plain http to non-loopback hosts. Defaults to MCP_WEBHOOK_ALLOW_INSECURE. */
  allowInsecure?: boolean;
}

/** Result of a webhook send attempt. */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Decides whether a webhook URL may be used.
 *
 * Reports travel over https. Plain http is allowed only to loopback hosts, for
 * local receivers during development, or when explicitly permitted.
 *
 * @param url - The webhook endpoint.
 * @param allowInsecure - Whether plain http to any host is permitted.
 * @returns An error message, or undefined when the URL is acceptable.
 */
function rejectUrl(url: string, allowInsecure: boolean): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Invalid webhook URL "${url}"`;
  }
  if (parsed.protocol === "https:") return undefined;
  if (parsed.protocol !== "http:") {
    return `Unsupported webhook URL scheme "${parsed.protocol}"; use https`;
  }
  if (LOOPBACK_HOSTS.has(parsed.hostname) || allowInsecure) return undefined;
  return (
    `Refusing to send the report over plain http to "${parsed.hostname}"; ` +
    `use https or set ${WEBHOOK_ALLOW_INSECURE_ENV}=1`
  );
}

/**
 * Computes the signature header value for a request body.
 *
 * @param secret - The shared secret.
 * @param body - The exact bytes sent as the request body.
 * @returns "sha256=<hex>" for the receiver to verify with the same secret.
 */
export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf-8").digest("hex")}`;
}

/**
 * Sends a webhook payload to the given URL via HTTP POST.
 *
 * Uses Node's built-in `fetch()` with `AbortSignal.timeout()` for timeout
 * handling. Redirects are not followed, so a receiver cannot forward the
 * report elsewhere. When a secret is configured the body is signed with
 * HMAC-SHA256 in the X-MCP-Signature header. Never throws; returns a result
 * object indicating success or failure.
 *
 * @param url - The webhook endpoint URL.
 * @param payload - The webhook payload to send.
 * @param options - Optional configuration (timeout, secret, insecure).
 * @returns A result indicating success or failure.
 */
export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  options?: WebhookOptions,
): Promise<WebhookResult> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const secret = options?.secret ?? process.env[WEBHOOK_SECRET_ENV];
  const allowInsecure =
    options?.allowInsecure ?? ["1", "true"].includes(process.env[WEBHOOK_ALLOW_INSECURE_ENV] ?? "");

  const rejection = rejectUrl(url, allowInsecure);
  if (rejection) {
    return { success: false, error: rejection };
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    headers[WEBHOOK_SIGNATURE_HEADER] = signWebhookBody(secret, body);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      return { success: true, statusCode: response.status };
    }

    return {
      success: false,
      statusCode: response.status,
      error: `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (err) {
    return { success: false, error: describeFetchError(err) };
  }
}

/**
 * Produces a readable message for a failed fetch.
 *
 * Node reports most network-level failures as a bare "fetch failed" with the
 * real reason (DNS, refused connection, unexpected redirect) in `cause`.
 *
 * @param err - The thrown value.
 * @returns The message, including the cause when present.
 */
function describeFetchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err.cause as { message?: string } | undefined) : undefined;
  return cause?.message ? `${message}: ${cause.message}` : message;
}
