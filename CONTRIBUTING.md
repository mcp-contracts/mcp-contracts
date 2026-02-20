# CONTRIBUTING.md

## Architecture Decisions

This document records the key design decisions for the project and the reasoning behind them. If you're contributing, understanding these decisions will help you write code that fits the project's philosophy.

---

### ADR-001: Monorepo with pnpm Workspaces

**Decision:** Single repo, multiple packages under `packages/`, managed with pnpm workspaces.

**Why:** The packages are tightly coupled (cli depends on core, test will depend on core). A monorepo lets us make cross-cutting changes in a single PR, share TypeScript config, and run CI once. pnpm is faster than npm/yarn, has excellent workspace support, and enforces strict dependency isolation.

---

### ADR-002: Library First, CLI Second

**Decision:** All logic lives in `@mcp-contracts/core`. The CLI is a thin wrapper that handles I/O (reading files, connecting to servers, formatting output) and calls into core.

**Why:** This makes core independently useful as a library. Other tools can import `@mcp-contracts/core` and use the snapshot format, diffing engine, and classification logic without pulling in CLI dependencies. It also makes core trivially testable — no I/O to mock.

**Rule of thumb:** If you find yourself writing an `if` statement about business logic in the CLI package, it probably belongs in core.

---

### ADR-003: ESM Only

**Decision:** All packages use `"type": "module"` and ESM imports. No CommonJS.

**Why:** The MCP SDK is ESM. Node.js 20+ has mature ESM support. Dual publishing (CJS + ESM) adds complexity for minimal benefit in 2026. Our users are on modern Node.

---

### ADR-004: tsup for Building

**Decision:** Use tsup (powered by esbuild) for building all packages.

**Why:** Zero-config for the common case (compile TS to JS, generate .d.ts files). Fast. Handles ESM output correctly. We don't need the full weight of tsc for building — we use tsc only for type checking.

---

### ADR-005: Biome for Formatting and Linting

**Decision:** Use Biome instead of ESLint + Prettier.

**Why:** Single tool, fast, opinionated defaults that are close to what we'd configure anyway. Eliminates the ESLint/Prettier config sprawl. Biome is mature enough for production use in 2026.

---

### ADR-006: The Snapshot is Plain JSON

**Decision:** Snapshots are JSON files, not binary, not YAML, not a database.

**Why:** JSON is universally readable, diffable in git, parseable in every language, and trivial to validate. The snapshot format is small (typically 5–50KB for a server with dozens of tools). There's no performance reason to use a binary format. Git-diffability is a feature — people should be able to see what changed in a snapshot by looking at git log.

---

### ADR-007: Content Hashing for Integrity

**Decision:** Every snapshot includes a SHA-256 hash of its semantic content (tools + resources + prompts).

**Why:** This enables content-addressable storage and integrity verification. Two snapshots with the same tools/resources/prompts will have the same hash, even if captured at different times. This is the foundation for future features like signed contracts and transparency logs.

The hash deliberately excludes metadata (timestamp, capture info) so that re-capturing the same server produces the same hash.

---

### ADR-008: Description Changes are Warnings, Not Safe

**Decision:** Any change to a tool, resource, or prompt description is classified as a `warning`, not `safe`.

**Why:** This is a security decision. Tool descriptions are the primary vector for tool poisoning attacks (OWASP MCP03:2025). A malicious actor who gains write access to an MCP server can embed hidden instructions in tool descriptions that influence model behavior without changing the schema. By flagging all description changes, we ensure that human reviewers see them.

This is the feature that differentiates us from a naive JSON differ.

---

### ADR-009: Exit Codes for CI

**Decision:** The CLI uses exit codes 0/1/2 with configurable thresholds.

**Why:** This makes the tool usable in CI pipelines without wrapper scripts. `mcpdiff diff a.json b.json` returns 1 if there are breaking changes — you can put it in a GitHub Action and it fails the build automatically. The `--fail-on` flag lets teams tune their strictness (e.g., `--fail-on warning` for security-conscious teams).

---

### ADR-010: No AI/LLM Dependencies in Core

**Decision:** The core diffing engine is entirely deterministic. No LLM calls, no AI analysis.

**Why:** Determinism is a feature. When you run the diff twice on the same input, you must get the same output. LLM-based analysis (e.g., "does this description change look suspicious?") is inherently non-deterministic and adds latency, cost, and a runtime dependency. We may add optional LLM-powered analysis in a separate package later, but core stays pure.

---

## Pull Request Conventions

- **One concern per PR.** Don't mix refactors with features.
- **Tests required.** Every PR that changes `core` must include tests. Every new classification rule must have at least two test cases (one positive, one negative).
- **Spec changes need discussion.** If your change affects the snapshot format or classification rules, open an issue first to discuss before implementing.
- **Commit messages:** Use conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- **Branch naming:** `feat/description`, `fix/description`, `docs/description`.

## Development Workflow

```bash
# Clone and install
git clone https://github.com/mcp-contracts/mcp-contracts.git
cd mcp-contracts
pnpm install

# Build everything
pnpm -r build

# Run all tests
pnpm -r test

# Type check
pnpm -r typecheck

# Lint and format
pnpm biome check .
pnpm biome format . --write

# Work on a specific package
cd packages/core
pnpm test -- --watch
```

## Adding a New Classification Rule

1. Add the rule to `SPEC.md` section 2 with severity and rationale.
2. Implement the detection in `packages/core/src/diff.ts` (or the relevant sub-module).
3. Add test fixtures in `packages/core/src/__fixtures__/`.
4. Write at least two test cases in the corresponding `.test.ts` file.
5. Update the terminal formatter if the rule needs special display (e.g., description diff rendering).

## Project Roadmap

### Phase 1 — Schema Diff Tool (current)
Ship `@mcp-contracts/core` and `@mcp-contracts/cli` with snapshot capture, diffing, and inspection.

### Phase 2 — Contract Testing
Add `@mcp-contracts/test` for automated contract validation against live servers.

### Phase 3 — Ecosystem
Signing, transparency logs, registry integration, GitHub Action, VS Code extension.
