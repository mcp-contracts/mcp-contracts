import type { DiffReport } from "./diff-types.js";

/** How the diff was triggered. */
export type WebhookTrigger = "cli" | "watch" | "ci";

/** Source metadata describing where the webhook event originated. */
export interface WebhookSource {
  /** What triggered the diff. */
  trigger: WebhookTrigger;
  /** Path to the baseline file, if applicable. */
  baselinePath?: string;
  /** Server source (command or URL). */
  serverSource?: string;
}

/** Payload sent to webhook endpoints when a diff completes. */
export interface WebhookPayload {
  /** Event type identifier. */
  event: "diff.completed";
  /** ISO 8601 timestamp of when the event was created. */
  timestamp: string;
  /** Source metadata describing the trigger. */
  source: WebhookSource;
  /** The full diff report. */
  report: DiffReport;
}

/**
 * Creates a webhook payload wrapping a diff report with event metadata.
 *
 * @param report - The diff report to include.
 * @param source - Source metadata describing the trigger.
 * @returns A complete WebhookPayload ready for JSON serialization.
 */
export function createWebhookPayload(report: DiffReport, source: WebhookSource): WebhookPayload {
  return {
    event: "diff.completed",
    timestamp: new Date().toISOString(),
    source,
    report,
  };
}
