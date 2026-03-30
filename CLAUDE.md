# CLAUDE.md — Project Instructions for Claude Code

## Project Overview

**mcp-contracts** is a monorepo containing tools for capturing, diffing, and validating MCP (Model Context Protocol) tool schemas. The goal is to bring OpenAPI-level contract safety to the MCP ecosystem.

The project is published under the `@mcp-contracts` npm scope. The GitHub org is `mcp-contracts`.

## Packages

```
packages/
  core/       → @mcp-contracts/core     — Snapshot types, diffing engine, classification logic, formatters
  cli/        → @mcp-contracts/cli      — The `mcpdiff` CLI tool (bin: mcpdiff)
  test/       → @mcp-contracts/test     — Contract testing library (bin: mcp-test)
```

Future packages (do not create yet):
- `packages/github-action/` → GitHub Action for CI integration

## Tech Stack & Conventions

- **Runtime:** Node.js >= 20
- **Language:** TypeScript 5.x, strict mode, ESM only (`"type": "module"` in all package.json)
- **Package manager:** pnpm with workspaces
- **Build:** tsup (fast, zero-config bundler for TypeScript libraries and CLIs)
- **Test:** Vitest
- **Linting:** Biome (not ESLint — we use Biome for both formatting and linting)
- **CLI framework:** commander
- **Schema validation:** zod (v4, matching the MCP SDK)
- **MCP SDK:** `@modelcontextprotocol/sdk` (official TypeScript SDK)

## Code Style Rules

- No default exports. Always use named exports.
- No classes unless wrapping a stateful resource (like a connection). Prefer plain functions and types.
- No `any`. Use `unknown` and narrow with type guards.
- Error handling: never throw raw strings. Always throw `Error` or a typed subclass.
- File naming: kebab-case for files (`diff-engine.ts`), PascalCase for types, camelCase for functions/variables.
- Keep files under 300 lines. Split when a file grows beyond that.
- Every public function must have a JSDoc comment with `@param` and `@returns`.
- Write tests alongside implementation. Every file `foo.ts` should have a `foo.test.ts`.

## Architecture Principles

1. **The snapshot format is the foundation.** Every other feature (diff, test, sign) operates on snapshots. Get this right. The format is defined in `packages/core/src/snapshot.ts` and specified in `SPEC.md`.

2. **Library first, CLI second.** The `core` package exposes all functionality as a library. The `cli` package is a thin wrapper that calls into `core`. Never put business logic in the CLI package.

3. **Zero network calls in `core`.** The core package operates on snapshot data (JSON objects/files). The CLI handles connecting to servers, reading files, etc. This separation makes core fully testable without mocking network.

4. **Exit codes matter.** The CLI uses exit codes for CI integration:
   - `0` = no breaking changes (warnings are OK)
   - `1` = breaking changes detected
   - `2` = tool error (bad input, connection failure, etc.)

5. **Output formats.** Every command that produces output supports `--format json|terminal|markdown`. JSON is the default for programmatic use. Terminal is the default when stdout is a TTY.

## Key Dependencies

```
# Core
@modelcontextprotocol/sdk    — MCP client, types, transports
zod                          — Schema validation (v4)
fast-json-patch              — RFC 6902 JSON patching (used in diff engine)

# CLI
commander                    — CLI framework
chalk                        — Terminal colors (use sparingly)
cli-table3                   — Table output for terminal

# Dev
tsup                         — Build
vitest                       — Test
biome                        — Format + lint
@types/node                  — Node.js types
```

## Important Files to Read Before Working

- `SPEC.md` — Full technical specification for the snapshot format, diff classification rules, and planned features. **Read this before implementing anything in core.**
- `CONTRIBUTING.md` — Architecture decisions, PR conventions, and the design rationale.
- `packages/core/src/snapshot.ts` — The snapshot type definition (source of truth for the format).
- `packages/core/src/diff.ts` — The diffing engine (the core intellectual property of the project).

## Common Tasks

### Build all packages
```bash
pnpm -r build
```

### Run all tests
```bash
pnpm -r test
```

### Run the CLI locally during development
```bash
# From repo root
pnpm --filter @mcp-contracts/cli dev -- snapshot --command "node some-server.js"

# Or after building
node packages/cli/dist/index.js snapshot --command "node some-server.js"
```

### Add a dependency to a specific package
```bash
pnpm --filter @mcp-contracts/core add zod
pnpm --filter @mcp-contracts/cli add commander
```

## Milestone Workflow

When tackling a new milestone (e.g., `v0.4.0`):

1. **Fetch issues from GitHub.** Use `gh` to list all issues in the milestone. Read every issue body — these are the requirements.
2. **Create a branch.** Name it `milestone/<milestone-name>` (e.g., `milestone/v0.4.0-Contract-Signing-Integrity`).
3. **One commit per logical task.** Each discrete piece of work (types, functions, a CLI command, etc.) gets its own commit with passing tests.
4. **Verify before pushing.** All of these must pass before creating the PR:
   - `pnpm -r build`
   - `pnpm -r test`
   - `pnpm -r typecheck`
   - `pnpm run lint`
5. **Create a PR with closing keywords.** The PR body must include `Closes #N` for every issue in the milestone so they auto-close on merge. The milestone itself auto-closes when all its issues are closed.
6. **Set the milestone on the PR.** Use `gh api repos/mcp-contracts/mcp-contracts/issues/<pr-number> -X PATCH -f milestone=<milestone-number>` since `gh pr create --milestone` expects exact title match.
7. **GitHub Action repo.** If the milestone includes GitHub Action changes, commit and push a matching branch in the `github-action` repo.

## Versioning

All packages share a single version number, bumped together. The publish workflow is triggered by a `v*` tag and publishes all packages at that version. When preparing a milestone PR, bump all package.json versions to the milestone version (e.g., all packages go to 0.5.0 for the v0.5.0 milestone).

## Git Workflow

**Commit after every completed task from TASKS.md.** Each task = one commit. No exceptions.

- After finishing a task (implementation + tests passing), stage all changed files and commit.
- Commit message format: `feat(core): <short description from TASKS.md>`
  - Examples:
    - `feat(core): content hash function`
    - `feat(core): diff engine tool-level changes`
    - `feat(cli): inspect command`
    - `chore: integration tests`
- Use `feat` for tasks that add functionality, `chore` for polish/test-only tasks, `docs` for docs-only tasks.
- The scope should be the package that was primarily changed: `core`, `cli`, or omit for repo-wide changes.
- Do NOT combine multiple tasks into one commit.
- Do NOT commit half-finished tasks. Every commit should have passing tests (`pnpm -r test`).
- Run `pnpm -r build` before committing to verify the build is clean.
- Do NOT add a co-authored by message.

This gives us a git history like:
```
feat(core): content hash function
feat(core): snapshot creation
feat(core): diff engine tool-level changes
feat(core): diff engine input schema changes
feat(core): diff engine resource and prompt changes
feat(core): output formatters
feat(cli): inspect command
feat(cli): diff command
feat(cli): snapshot command
chore: integration tests
docs: README examples verification
chore: npm publish preparation
```

## Testing Guidelines

- Unit tests for every function in `core`. Use snapshot testing for diff output.
- Create fixture files in `packages/core/src/__fixtures__/` for test snapshots.
- The diff engine tests should cover every classification rule listed in SPEC.md.
- Integration tests in `cli` should test actual CLI invocations using `execa`.
- Do NOT mock the MCP SDK in unit tests — instead, create minimal test snapshot data.

## What NOT To Do

- Do not add Express, Fastify, or any HTTP framework. This is a CLI tool and library.
- Do not add React or any frontend. If we need a web UI later, it's a separate package.
- Do not use `console.log` for output in `core`. Return structured data; let the CLI handle display.
- Do not add LLM/AI dependencies for now. The diff engine is deterministic.
- Do not publish to npm without explicit instruction from the maintainer.
- Do not create packages beyond `core`, `cli`, and `test` without explicit instruction.