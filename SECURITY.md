# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in mcp-contracts, please report it responsibly through GitHub's private vulnerability reporting:

**https://github.com/mcp-contracts/mcp-contracts/security/advisories/new**

**Do not open a public issue.** Include:

- A description of the vulnerability
- Steps to reproduce
- Impact assessment (if known)

You should receive an acknowledgment within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

This policy covers:

- `@mcp-contracts/core` — the snapshot and diffing library
- `@mcp-contracts/cli` — the `mcpdiff` CLI tool
- `@mcp-contracts/test` — the contract conformance testing library
- The snapshot format (`.mcpc.json`)

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.8.x   | Yes       |
| < 0.8   | No        |
