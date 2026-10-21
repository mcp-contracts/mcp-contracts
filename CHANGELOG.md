# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **A contract change the diff engine cannot classify is no longer reported as "no changes".** Tool `annotations` are now diffed (`warning`), nested schemas are compared whenever either side has `properties` rather than only when `type` is the literal string `"object"`, and any remaining difference in a tool, resource or prompt produces a `warning` change `<category>.<name>.unclassified`. Previously such changes moved the content hash while `check` printed "No changes detected." and exited 0.
- **Discovery pagination is bounded.** List calls stop after 1000 pages or 10 000 items per list, refuse a repeated cursor, and share a five-minute capture deadline. Exceeding a bound is a discovery failure (exit 2). Previously a server returning an endless `nextCursor` hung every live-capture command until the CI timeout.
- **Names equal to `__proto__` are kept.** Snapshot records and the canonical hash object are now null-prototype objects, so a tool, resource, prompt or nested schema key with that name is stored, hashed, signed and diffed instead of silently disappearing.

## [0.8.3] - 2026-10-21

### Fixed

- **Failed discovery no longer produces an empty snapshot and a clean check.** When a server advertises a capability but the corresponding list call fails (for example a JSON-RPC `-32603` from `tools/list`, on any page), capture previously warned on stderr, wrote an empty list and exited 0. `check` against such a baseline then reported "Contract unchanged". Every command that captures a live server now fails with exit code 2 and names each list call that failed. Reported privately by Kill The Prompt ([@killtheprompt](https://github.com/killtheprompt)).

### Changed

- Security reports now go through GitHub private vulnerability reporting; `SECURITY.md` points at the advisory form instead of an email address, lists the `test` package in scope, and marks 0.8.x as the supported line.
- `zod` 4.6.6 → 4.6.7.

### Internal

- Dev tooling: `vitest` 5.0.5. `vite` declared as a root dev dependency at `^8.2.4` and resolved to 8.3.5, clearing three `launch-editor` advisories in the previously auto-installed 8.2.0 peer; the published packages never depended on it.

## [0.8.2] - 2026-10-15

### Security

- **`@modelcontextprotocol/sdk` raised to `^1.32.1`** — clears a high-severity advisory affecting `>= 1.12.0, < 1.31.0`, where an OAuth client could send credentials to an authorization server chosen by the MCP server. The previous `^1.30.1` floor still permitted a vulnerable resolution.

### Changed

- `zod` 4.6.5 → 4.6.6.

### Internal

- Dev tooling: `biome` 2.5.15, `@types/node` 26.6.5, `tsdown` 0.23.1, `vitest` 5.0.3. `biome.json` `$schema` pin synced.

## [0.8.1] - 2026-10-05

### Changed

- `@modelcontextprotocol/sdk` 1.30.0 → 1.30.1, `zod` 4.5.4 → 4.6.5.

### Internal

- **`pnpm -r typecheck` added to the CI and publish workflows.** Both previously gated on lint, build and test only, so a type regression could reach `main` and, via the publish workflow, npm.
- Dev tooling: `vitest` 4 → 5, `biome` 2.5.14, `@types/node` 26.6.2. `biome.json` `$schema` pin synced.

## [0.8.0] - 2026-09-03

### Changed

- **Build migrated from tsup to tsdown.**

### Fixed

- **Shell-split `--command` strings for the stdio transport** — commands with arguments are now parsed correctly rather than treated as a single executable name.

### Internal

- Examples moved out to the `example-contact-server` repository.
- Security refreshes for transitive dependencies: `fast-uri`, `qs`, `nanoid`.

## [0.7.3] - 2026-08-11

### Security

- Forced `esbuild` 0.28.1 via a pnpm override to clear an advisory.

## [0.7.2] - 2026-08-07

### Security

- Updated transitive dependencies for several advisories, including `postcss`.

### Internal

- Publish release notes directly instead of creating drafts.

## [0.7.1] - 2026-07-14

### Documentation

- Rewrote the root README, the `cli` package README for the 0.7 command surface, and pointed the `test` package README at `mcpdiff test`.

### Internal

- Held TypeScript at 5.x and adapted to biome 2.5.

## [0.7.0] - 2026-07-13

### Added

- **`mcpdiff check` and `mcpdiff update`** — verify the live server against a committed baseline, and refresh that baseline.
- **`mcpdiff init`** — onboarding command that scaffolds project configuration.
- **`mcpdiff test`** — contract testing built directly into the CLI, replacing the separate `mcp-test` bin.
- **Project configuration (`mcpcontracts.json`)** — discovery and loading, with transport and baseline resolved from the config file.
- `mcpdiff verify` absorbs the former `verify-hash` command.

### Deprecated

- The `ci`, `watch` and `baseline` commands, and `diff --live`.
- The `mcp-test` bin, which now prints a migration notice pointing at `mcpdiff test`.

### Core Library

- `mcpcontracts.json` schema and validation.
- Empty diff report helper.

### Fixed

- Stdio servers declared in a project config are spawned from the config's directory rather than the current working directory.

## [0.6.0] - 2026-07-08

### Added

- **Multi-server composition** — read a multi-server config, capture one snapshot per server, and diff an entire composition against its baselines in a single report.
- **`mcpdiff check-conflicts`** — detect duplicate tool names across servers and fail on conflicting schemas.
- **`mcpdiff graph`** — render the dependency graph of a composition.

### Core Library

- `composition` types, composition diff, and tool namespace collision detection.
- Dependency graph construction.
- Composition and collision formatters, including rename and missing-baseline hints in composition diff output.

## [0.5.0] - 2026-04-08

### Added

- **`@mcp-contracts/test` package** — a contract testing library with an `mcp-test` CLI, covering:
  - schema conformance testing against a snapshot
  - boundary input testing (empty strings, zero values, missing optionals)
  - behavioral assertions on tool output
  - vitest/jest matchers
  - an MCP client wrapper, test runner and output formatters

### Internal

- Added the `test` package to the publish workflow.

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
