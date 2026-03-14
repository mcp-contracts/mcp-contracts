import type { DiffReport, Severity } from "./diff-types.js";

/** Default glob patterns to ignore during file watching. */
export const DEFAULT_WATCH_IGNORE_PATTERNS: readonly string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/*.mcpc.json",
];

/** Configuration for watch mode. */
export interface WatchConfig {
  /** Debounce interval in milliseconds. */
  debounceMs: number;
  /** Paths to watch for changes. */
  watchPaths: string[];
  /** Glob patterns to ignore. */
  ignorePatterns: string[];
  /** Minimum severity to display in output. */
  minSeverity: Severity;
  /** Severity threshold that triggers a non-zero exit. */
  failOn: Severity;
}

/** Event emitted after each watch cycle completes. */
export interface WatchDiffEvent {
  /** Monotonically increasing cycle number. */
  cycle: number;
  /** ISO 8601 timestamp when this cycle completed. */
  timestamp: string;
  /** The diff report for this cycle, if successful. */
  report?: DiffReport;
  /** File paths that triggered this cycle. */
  triggerPaths: string[];
  /** Duration of this cycle in milliseconds. */
  durationMs: number;
  /** Error message if the cycle failed. */
  error?: string;
}

/** Options for creating a WatchConfig. */
export interface CreateWatchConfigOptions {
  debounceMs?: number;
  watchPaths?: string[];
  ignorePatterns?: string[];
  minSeverity?: Severity;
  failOn?: Severity;
}

/**
 * Creates a WatchConfig with sensible defaults.
 *
 * @param options - Partial config to override defaults.
 * @returns A complete WatchConfig.
 */
export function createWatchConfig(options?: CreateWatchConfigOptions): WatchConfig {
  return {
    debounceMs: options?.debounceMs ?? 500,
    watchPaths: options?.watchPaths ?? ["."],
    ignorePatterns: options?.ignorePatterns ?? [...DEFAULT_WATCH_IGNORE_PATTERNS],
    minSeverity: options?.minSeverity ?? "safe",
    failOn: options?.failOn ?? "breaking",
  };
}
