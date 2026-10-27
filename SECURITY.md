# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in mcp-contracts, please report it responsibly through GitHub's private vulnerability reporting:

**https://github.com/mcp-contracts/mcp-contracts/security/advisories/new**

**Do not open a public issue.** Include:

- A description of the vulnerability
- Steps to reproduce
- Impact assessment (if known)

You should receive an acknowledgment within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Trust Model

`mcpdiff` connects to MCP servers and runs the command that starts them. Two things follow from that.

**A project config executes code.** A committed `mcpcontracts.json` or `mcp.json` names a `command`, `args` and `env`; `check`, `snapshot`, `update`, `test`, `ci`, `watch` and `diff --live` run that command when invoked with no flags. The config is discovered by walking up from the current directory, so a config in any parent directory is used too. Treat these files like `package.json` scripts or a `Makefile`: only run `mcpdiff` inside repositories you trust, and review changes to them in pull requests. The resolved command is printed before it is spawned.

Paths in the config (`baseline`, `watch.paths`, `server.config`) are expected to stay inside the project directory. A path that resolves outside it, directly or through a symlink, is warned about today and will be rejected in a future release. Config discovery stops at the repository root (the first ancestor containing `.git`), so a config placed above the checkout is not picked up.

**Servers are untrusted.** Everything a server returns, including tool names, descriptions, schemas and error messages, is treated as attacker-controlled: it is bounded during discovery, stored verbatim, and sanitized before it is rendered to a terminal, markdown report, step summary or PR comment.

**In CI**, run contract checks on `pull_request`, never `pull_request_target`. On `pull_request` a fork's config runs with a read-only token and no repository secrets, which is the same exposure as `npm test`. With `pull_request_target` the same command would run with your secrets. When enforcing a signed baseline, supply the public key from a secret (`MCP_SIGNATURE_KEY`), not from the checkout, otherwise a pull request can replace key, baseline and signature together.

## Scope

This policy covers:

- `@mcp-contracts/core` — the snapshot and diffing library
- `@mcp-contracts/cli` — the `mcpdiff` CLI tool
- `@mcp-contracts/test` — the contract conformance testing library
- The snapshot format (`.mcpc.json`)

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.10.x  | Yes       |
| < 0.10  | No        |
