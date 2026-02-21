# MILESTONES.md — Roadmap & Future Features

> Last updated: 2026-02-21

This document outlines upcoming milestones for the mcp-contracts project. Each milestone maps to a GitHub Milestone with associated issues. Features are ordered by priority within each milestone, not by effort.

Feedback and feature requests are welcome — open an issue on GitHub.

---

## v0.2.0 — GitHub Action & CI Integration

**Theme:** Make mcpdiff a seamless part of every MCP server's CI pipeline.

The diff tool is useful locally, but the real impact comes when it runs automatically on every PR. This milestone focuses on making that frictionless.

### GitHub Action (`@mcp-contracts/diff-action`)
- Reusable GitHub Action that wraps `mcpdiff diff`
- Inputs: path to baseline snapshot, server command or URL to capture current state
- Automatically posts a formatted diff report as a PR comment (collapsible, with severity icons)
- Configurable fail conditions (`fail-on: breaking` or `fail-on: warning`)
- Caches snapshots between runs for performance
- Works with both stdio and HTTP-based servers

### `mcpdiff ci` Command
- A single command designed for CI environments: captures a snapshot, diffs against a baseline, outputs a report, and sets the exit code — all in one step
- `mcpdiff ci --baseline contracts/baseline.mcpc.json --command "node dist/index.js"`
- Detects CI environment (GitHub Actions, GitLab CI, CircleCI) and adjusts output format automatically
- Outputs `$GITHUB_STEP_SUMMARY` compatible markdown when running in GitHub Actions

### Baseline Management
- `mcpdiff baseline update` command — captures a new snapshot and writes it to a designated baseline path
- `mcpdiff baseline verify` — confirms the current server matches the committed baseline exactly (content hash comparison)
- Convention: `contracts/` directory at repo root for storing baselines

---

## v0.3.0 — Live Monitoring & Watch Mode

**Theme:** Catch schema drift in real time, not just at PR time.

### Live Diff
- `mcpdiff diff --live <url> baseline.mcpc.json` — connects to a running remote MCP server and diffs against a pinned contract
- Useful for monitoring deployed servers: has the production server drifted from what was approved?
- Designed for use in scheduled CI jobs, health checks, or monitoring dashboards

### Watch Mode
- `mcpdiff watch --command "node server.js" --baseline contracts/baseline.mcpc.json`
- Re-snapshots whenever server source files change (via filesystem watcher)
- Prints diff in real time during development — instant feedback on schema changes
- Useful during local development to see the impact of code changes on the tool contract

### Webhook / Notification Support
- `mcpdiff diff ... --webhook <url>` — POST the diff report as JSON to a webhook on completion
- Enables integration with Slack, Discord, PagerDuty, or custom alerting systems
- Pairs with live diff for production monitoring: "alert me when the production schema drifts"

---

## v0.4.0 — Contract Signing & Integrity

**Theme:** Make contracts tamper-evident and auditable.

This milestone addresses the supply chain security story directly. A signed contract proves who approved the schema and when, and any modification invalidates the signature.

### Snapshot Signing
- `mcpdiff sign snapshot.mcpc.json --key ./private.pem` — produces a detached signature file (`.mcpc.sig`)
- `mcpdiff verify snapshot.mcpc.json --key ./public.pem` — verifies the signature
- Uses standard Ed25519 or RSA signatures (via Node.js `crypto` module, no external deps)
- The signature covers the `contentHash` field, which itself covers the semantic content

### Signed Baselines in CI
- The GitHub Action and `mcpdiff ci` can optionally verify the baseline signature before diffing
- Prevents an attacker from modifying the baseline snapshot to hide breaking changes
- Key management is left to the user (GitHub Secrets, Vault, etc.) — we provide the signing primitives

### Content Hash Verification
- `mcpdiff verify-hash snapshot.mcpc.json` — recomputes the content hash and compares it to the stored value
- Quick integrity check without needing keys — catches accidental modification or corruption

---

## v0.5.0 — Contract Testing Library

**Theme:** Go beyond diffing — actively test that a server conforms to its contract.

### `@mcp-contracts/test` Package
- Library for running contract conformance tests against a live MCP server
- Takes a `.mcpc.json` snapshot as the contract and verifies the server matches it

### Schema Conformance Testing
- Connects to the server, lists tools, and asserts the schemas match the contract exactly
- Reports any deviations as test failures with structured error messages
- "Does this server still expose the tools it claims to, with the schemas it promised?"

### Boundary Input Testing
- Auto-generates edge case inputs from the tool's JSON Schema: empty strings, zero values, missing optional fields, type boundary values, oversized payloads
- Runs them against the server and verifies it handles them gracefully (returns errors, doesn't crash)
- "Does this server validate its inputs properly?"

### Behavioral Assertions
- User-defined assertions on tool outputs for specific inputs
- Simple predicate functions: `expect(result).toContain("created")`
- Optional LLM-as-judge mode for semantic assertions (separate optional dependency)
- "Does this tool still behave the way I expect?"

### Integration with Vitest / Jest
- Custom matchers: `expect(server).toConformToContract(contract)`
- Snapshot testing: `expect(server.getToolSchemas()).toMatchContractSnapshot()`
- Runs as standard unit tests in existing test suites

---

## v0.6.0 — Registry & Ecosystem Integration

**Theme:** Connect mcpdiff to the broader MCP ecosystem.

### MCP Registry Integration
- `mcpdiff snapshot --registry <server-id>` — capture a snapshot of a server listed in the official MCP Registry
- `mcpdiff registry diff <server-id> --baseline local.mcpc.json` — diff a registry server against a local baseline
- Uses the MCP Registry API (`registry.modelcontextprotocol.io/v0/servers/...`)

### `.well-known` Discovery Support
- When MCP servers start advertising their capabilities via `.well-known/mcp.json`, mcpdiff should be able to consume these for snapshot capture without a full server connection
- `mcpdiff snapshot --discover https://api.example.com` — auto-detects the server's advertised capabilities

### Contract Publishing
- `mcpdiff publish snapshot.mcpc.json` — publishes a contract to a registry (initially a simple git-based or HTTP-based store)
- Enables a workflow where server authors publish their contract alongside their server, and consumers pin against published contracts
- Format and hosting TBD based on community feedback

---

## v0.7.0 — Multi-Server & Composition

**Theme:** Support real-world agent architectures that use multiple MCP servers together.

### Multi-Server Snapshots
- `mcpdiff snapshot --config mcp.json --all` — captures snapshots of all servers defined in an MCP config in a single operation
- Outputs a combined snapshot or a directory of individual snapshots
- Useful for teams that use 5-10 MCP servers together and want to track all their contracts

### Composition Diff
- `mcpdiff diff --config mcp.json --baseline contracts/` — diffs all servers against their respective baselines
- Single command, single report, single exit code covering the entire agent's tool surface
- Answers: "did any of the tools my agent depends on change?"

### Tool Namespace Collision Detection
- When multiple servers are used together, tool names can collide
- `mcpdiff check-conflicts --config mcp.json` — detects duplicate tool names across servers
- Reports which servers define conflicting tools and how their schemas differ

### Dependency Graph
- `mcpdiff graph --config mcp.json` — outputs a visual dependency graph of your agent's tool surface
- Shows which servers provide which tools, resource dependencies, and capability overlaps
- Output formats: terminal (ASCII), Mermaid, DOT (Graphviz), JSON

---

## Future Considerations (Unscheduled)

These are ideas we're tracking but haven't committed to a milestone. They may be promoted based on community feedback and ecosystem developments.

### Transparency Log
- Append-only log of contract versions for a server, inspired by Certificate Transparency
- Enables auditing: "show me every version of this server's contract and when it changed"
- Could be implemented as a simple git repo, a Merkle tree, or integration with Sigstore/Rekor

### MCP Bundle Format (`.mcpb`) Support
- The MCP ecosystem has adopted a bundle format for portable local servers
- mcpdiff should be able to extract and snapshot tools from `.mcpb` bundles directly

### Agent-to-Agent Contract Tracking
- As MCP evolves to support agent-to-agent communication, the contract surface expands
- Track not just tool schemas but inter-agent message contracts and delegation boundaries

### Policy-as-Code Integration
- Integration with OPA/Rego or Cedar for declarative policy enforcement on contracts
- "This tool must never have a description longer than 500 characters"
- "No tool may accept a `password` parameter"
- "The `delete_*` tools must always require a `confirm` boolean"

### IDE Extension
- VS Code / Cursor extension that shows contract status inline
- Highlights tools that have drifted from their baseline
- "Go to contract definition" from tool usage in agent code

### Python SDK
- `mcp-contracts` Python package mirroring the core TypeScript library
- Given the large Python MCP community, this would expand reach significantly
- Lower priority than TypeScript since the MCP SDK itself is TypeScript-first

### Structured Output Schema Tracking
- The June 2025 spec added structured tool outputs
- As adoption grows, output schema diffing becomes equally important to input schema diffing
- The diff engine already supports this but the real-world coverage is limited — revisit when more servers declare output schemas

### Dashboard / Web UI
- A web interface for browsing contracts, viewing diffs, and monitoring server drift
- Likely a standalone package or hosted service rather than part of the CLI
- Lowest priority — the CLI and CI integration cover the primary use cases
