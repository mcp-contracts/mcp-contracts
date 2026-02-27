# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
