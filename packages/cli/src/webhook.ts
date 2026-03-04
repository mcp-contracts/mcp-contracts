import type { WebhookPayload } from "@mcp-contracts/core";

/** Options for sending a webhook. */
export interface WebhookOptions {
  /** Timeout in milliseconds. Defaults to 10000. */
  timeoutMs?: number;
}

/** Result of a webhook send attempt. */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Sends a webhook payload to the given URL via HTTP POST.
 *
 * Uses Node's built-in `fetch()` with `AbortSignal.timeout()` for timeout handling.
 * Never throws — returns a result object indicating success or failure.
 *
 * @param url - The webhook endpoint URL.
 * @param payload - The webhook payload to send.
 * @param options - Optional configuration (timeout).
 * @returns A result indicating success or failure.
 */
export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  options?: WebhookOptions,
): Promise<WebhookResult> {
  const timeoutMs = options?.timeoutMs ?? 10_000;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
