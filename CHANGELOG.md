# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-28

### Added

- **`mcpdiff sign` command** — Sign a snapshot with an Ed25519 or RSA private key. Produces a detached `.mcpc.sig` file alongside the snapshot. Verifies the content hash before signing to prevent signing corrupted files.
- **`mcpdiff verify` command** — Verify a snapshot's detached signature using a public key. Performs three checks: content hash integrity, hash binding, and cryptographic signature verification.
- **`mcpdiff verify-hash` command** — Quick integrity check: recomputes the content hash and compares to the stored value. No keys needed. Supports `--format json` for structured output.
- **`--verify-signature` flag on `mcpdiff ci`** — Require a valid signature on the baseline snapshot before diffing. Prevents baseline tampering in CI pipelines.
- **`--signature-key` option on `mcpdiff ci`** — Path to the public key for signature verification. Falls back to `MCP_SIGNATURE_KEY` environment variable (accepts PEM content or file path).
- **GitHub Action `verify-signature` and `signature-key` inputs** — Enable baseline signature verification in the GitHub Action.

### Core Library

- `signContentHash()` — Sign a content hash with a private key, returning a `DetachedSignature`.
- `verifySignature()` — Verify a snapshot against a detached signature and public key.
- `verifyContentHash()` — Recompute and compare a snapshot's content hash.
- `detectKeyAlgorithm()` — Auto-detect Ed25519 or RSA from a PEM key.
- `parseSignatureFile()` — Parse and validate a `.mcpc.sig` JSON file.
- `DetachedSignature`, `SignatureAlgorithm`, `VerifySignatureResult`, `VerifyHashResult` types.
- `SIGNATURE_VERSION` constant (`"1.0.0"`).

## [0.3.0] - 2026-03-18

### Added

- **`mcpdiff watch` command** — Watch for file changes and re-diff against a baseline on every change. Configurable debounce, watch paths, and ignore patterns.
- **Live diff (`--live` flag)** — Diff a baseline against a live server directly with `mcpdiff diff baseline.mcpc.json --live --command "node server.js"`, without capturing a separate snapshot file.
- **Webhook support (`--webhook` flag)** — POST diff results to a URL on `diff`, `ci`, and `watch` commands. Sends a structured `WebhookPayload` with event type, source info, and full diff report.
- **SSE transport (`--sse` flag)** — Use SSE transport instead of streamable-http when connecting via `--url`.
- **Custom HTTP headers (`--header` flag)** — Pass custom headers as `"Key: Value"` pairs to HTTP/SSE transports. Repeatable.

### Core Library

- `createWatchConfig()` — Create a validated watch configuration with defaults.
- `DEFAULT_WATCH_IGNORE_PATTERNS` — Default ignore patterns for watch mode (`node_modules`, `.git`, `dist`, `*.mcpc.json`).
- `WatchConfig`, `WatchDiffEvent`, `CreateWatchConfigOptions` types.
- `createWebhookPayload()` — Build a structured webhook payload from a diff report.
- `WebhookPayload`, `WebhookSource`, `WebhookTrigger` types.

## [0.2.0] - 2026-02-27

### Added

- **`mcpdiff ci` command** — All-in-one CI command: captures snapshot, diffs against baseline, outputs report, sets exit code. Auto-detects CI environment (GitHub Actions, GitLab CI, CircleCI) and adjusts output format.
- **`mcpdiff baseline update`** — Captures a snapshot and writes it to a baseline path.
- **`mcpdiff baseline verify`** — Verifies the current server matches a committed baseline (content hash comparison).
- **GitHub Action** (`packages/github-action/`) — Reusable GitHub Action for CI pipelines. Diffs MCP server schemas against a baseline, posts PR comments, writes step summaries.
- **CI environment detection** — Detects GitHub Actions, GitLab CI, CircleCI. Writes GitHub Actions step summaries automatically.
- **PR comment support** — GitHub Action posts (or updates) a collapsible diff report as a PR comment.

### Internal

- Extracted shared transport resolution to `packages/cli/src/transport.ts`.

## [0.1.0] - 2026-02-21

### Added

- **Snapshot capture** — connect to a live MCP server (stdio or streamable HTTP) and capture a full snapshot of its tools, resources, resource templates, and prompts
- **Snapshot format** — versioned `.mcpc.json` format with content hashing (SHA-256) for integrity verification
- **Diff engine** — compare two snapshots and detect added, removed, and modified tools, resources, and prompts
- **Schema diffing** — deep comparison of JSON Schema input/output schemas including type changes, requiredness, enum values, constraints, and nested objects
- **Change classification** — every change is classified as `breaking`, `warning`, or `safe` following documented rules
- **Output formatters** — terminal (colored tables), JSON, and Markdown output formats
- **`mcpdiff snapshot`** — CLI command to capture snapshots from live servers or mcp.json config files
- **`mcpdiff diff`** — CLI command to diff two snapshot files with severity filtering and exit code signaling
- **`mcpdiff inspect`** — CLI command to inspect a snapshot file and display its contents
- **CI-friendly exit codes** — `0` for no breaking changes, `1` for breaking changes detected, `2` for tool errors

### Packages

- `@mcp-contracts/core` — snapshot types, diffing engine, classification logic, formatters
- `@mcp-contracts/cli` — the `mcpdiff` CLI tool
