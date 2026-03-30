# SPEC.md — Technical Specification

> Version: 0.1.0-draft
> Last updated: 2026-02-20

## 1. Snapshot Format

A snapshot (file extension `.mcpc.json`) captures the complete public interface of an MCP server at a point in time. It is a JSON file conforming to the following structure.

### 1.1 Top-Level Schema

```typescript
interface MCPContractSnapshot {
  /** Snapshot format version (semver). Currently "1.0.0". */
  snapshotVersion: "1.0.0";

  /** ISO 8601 timestamp of when this snapshot was captured. */
  capturedAt: string;

  /** SHA-256 hash of the canonical JSON of the `tools`, `resources`, and `prompts` fields.
   *  Used for integrity verification and content-addressable storage. */
  contentHash: string;

  /** Information about the server, as reported by the server during initialization. */
  server: {
    /** Server name from the InitializeResult. */
    name: string;
    /** Server version from the InitializeResult. */
    version: string;
    /** The MCP protocol version the server supports. */
    protocolVersion: string;
    /** Server-declared capabilities. */
    capabilities: Record<string, unknown>;
  };

  /** How this snapshot was captured. Informational only. */
  capture: {
    /** Transport used: "stdio" | "streamable-http" | "sse" */
    transport: string;
    /** The command or URL used to connect, if applicable. */
    source?: string;
    /** Name and version of the tool that created this snapshot. */
    tool: string;
  };

  /** All tools exposed by the server. Keyed by tool name. */
  tools: Record<string, ToolContract>;

  /** All resources exposed by the server. Keyed by resource URI or URI template. */
  resources: Record<string, ResourceContract>;

  /** All prompts exposed by the server. Keyed by prompt name. */
  prompts: Record<string, PromptContract>;
}
```

### 1.2 ToolContract

```typescript
interface ToolContract {
  /** The tool's human-readable description, as provided to the model. */
  description: string;

  /** JSON Schema defining the tool's input parameters.
   *  This is the `inputSchema` from the MCP ListToolsResult. */
  inputSchema: JSONSchema;

  /** JSON Schema defining the tool's structured output, if declared.
   *  Only present if the server uses the structured output feature (2025-06-18+). */
  outputSchema?: JSONSchema;

  /** Annotations/hints from the tool definition, if present.
   *  Example: { "audience": ["user"], "destructive": true } */
  annotations?: Record<string, unknown>;
}
```

### 1.3 ResourceContract

```typescript
interface ResourceContract {
  /** Resource description. */
  description: string;
  /** MIME type of the resource, if declared. */
  mimeType?: string;
  /** Whether this is a URI template (true) or a fixed URI (false). */
  isTemplate: boolean;
}
```

### 1.4 PromptContract

```typescript
interface PromptContract {
  /** Prompt description. */
  description: string;
  /** Arguments the prompt accepts. */
  arguments: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}
```

### 1.5 Content Hash Computation

The `contentHash` is computed as follows:

1. Create a JSON object with exactly three keys: `tools`, `resources`, `prompts`, in that order.
2. Serialize it with `JSON.stringify()` using sorted keys (pass a replacer that sorts object keys alphabetically at every level).
3. Compute SHA-256 of the resulting UTF-8 string.
4. Encode as `sha256:<hex>`.

This ensures that two snapshots with identical tool/resource/prompt definitions always produce the same hash, regardless of capture metadata.

---

## 2. Diff Classification Rules

When comparing two snapshots (referred to as `before` and `after`), changes are classified into three severity levels.

### 2.1 Severity Levels

| Level | Exit Code | Meaning |
|-------|-----------|---------|
| `breaking` | 1 | The change will likely cause existing clients/agents to fail. |
| `warning` | 0 | The change may affect behavior but won't cause hard failures. Includes potential security concerns. |
| `safe` | 0 | The change is backward-compatible. |

### 2.2 Tool-Level Changes

| Change | Severity | Rationale |
|--------|----------|-----------|
| Tool removed | `breaking` | Agents relying on this tool will fail. |
| Tool added | `safe` | New capability, no existing behavior affected. |
| Tool description changed | `warning` | Description changes are the primary vector for tool poisoning attacks. Models use descriptions to decide when and how to call tools. A changed description could embed hidden instructions. |

### 2.3 Input Schema Changes

| Change | Severity | Rationale |
|--------|----------|-----------|
| Required parameter added | `breaking` | Existing calls without this parameter will fail validation. |
| Required parameter removed | `warning` | Existing calls will still work, but the parameter is now ignored. Could indicate unintended behavior change. |
| Optional parameter added | `safe` | Backward-compatible. |
| Optional parameter removed | `warning` | Agents may still send this parameter; it will be silently ignored. |
| Parameter type changed | `breaking` | Existing calls with the old type will fail validation. |
| Parameter type widened (e.g., `string` → `string | number`) | `safe` | Old values are still valid. |
| Parameter type narrowed (e.g., `string | number` → `string`) | `breaking` | Some old values are now invalid. |
| Enum values removed | `breaking` | Agents using removed values will fail. |
| Enum values added | `safe` | Old values still valid. |
| Parameter description changed | `warning` | Same tool poisoning concern as tool description. |
| Parameter `default` changed | `warning` | May change behavior for calls that omit the parameter. |
| Parameter `format` added or changed | `warning` | May cause previously valid inputs to fail. |
| `additionalProperties` changed from true/unset to false | `breaking` | Previously accepted extra fields will now be rejected. |
| `additionalProperties` changed from false to true/unset | `safe` | More permissive. |
| `minItems`, `maxItems`, `minLength`, `maxLength`, `minimum`, `maximum` made stricter | `breaking` | Previously valid values may now fail. |
| `minItems`, `maxItems`, etc. made more lenient | `safe` | More permissive. |

### 2.4 Output Schema Changes

| Change | Severity | Rationale |
|--------|----------|-----------|
| Output schema added where none existed | `safe` | Clients can now expect structured output. |
| Output schema removed | `breaking` | Clients expecting structured output will break. |
| Required field added to output | `warning` | Not a client input issue, but may affect downstream processing. |
| Required field removed from output | `breaking` | Clients expecting this field will fail. |
| Output field type changed | `breaking` | Client parsing may fail. |

### 2.5 Resource Changes

| Change | Severity | Rationale |
|--------|----------|-----------|
| Resource removed | `breaking` | Agents using this resource will fail. |
| Resource added | `safe` | New capability. |
| Resource MIME type changed | `warning` | May affect how clients process the resource. |
| Resource description changed | `warning` | Same poisoning concern. |

### 2.6 Prompt Changes

| Change | Severity | Rationale |
|--------|----------|-----------|
| Prompt removed | `breaking` | Agents using this prompt will fail. |
| Prompt added | `safe` | New capability. |
| Prompt argument added (required) | `breaking` | Existing calls will fail. |
| Prompt argument added (optional) | `safe` | Backward-compatible. |
| Prompt argument removed | `warning` | Existing calls may send unused arguments. |
| Prompt description changed | `warning` | Poisoning concern. |

### 2.7 Description Change Detection (Security Feature)

Because tool description changes are the primary vector for tool poisoning, the diff engine should provide enhanced analysis for description changes:

1. **Flag all description changes as warnings**, even if the content looks benign.
2. **Detect suspicious patterns** in new descriptions:
   - Instructions directed at the model (e.g., "You must...", "Always...", "Ignore previous...")
   - URLs or email addresses not present in the old description
   - Hidden Unicode characters or zero-width spaces
   - Markdown/HTML that could hide content from human reviewers but be visible to models
3. **Show a readable diff** of the old vs new description text, not just "changed."

This is a key differentiator of the tool and directly addresses the OWASP MCP03:2025 (Tool Poisoning) threat.

---

## 3. CLI Specification

### 3.1 Global Options

```
mcpdiff [command] [options]

Global options:
  --format <format>    Output format: terminal | json | markdown (default: auto-detect)
  --no-color           Disable colored output
  --quiet              Suppress non-essential output
  --verbose            Show detailed information
  --version            Show version
  --help               Show help
```

### 3.2 `mcpdiff snapshot`

Captures a snapshot from a live MCP server.

```
mcpdiff snapshot [options]

Options:
  --command <cmd>       Server command to run via stdio transport (e.g., "node server.js")
  --args <args...>      Additional arguments to pass to the server command
  --url <url>           Server URL for streamable-http transport
  --config <path>       Path to mcp.json config file
  --server <name>       Server name from config file (used with --config)
  --output, -o <path>   Output file path (default: stdout)
  --env <key=value...>  Environment variables to pass to the server

Examples:
  mcpdiff snapshot --command "node dist/index.js" -o snapshot.mcpc.json
  mcpdiff snapshot --url http://localhost:3000/mcp -o snapshot.mcpc.json
  mcpdiff snapshot --config ./mcp.json --server my-server -o snapshot.mcpc.json
```

**Behavior:**
1. Connect to the MCP server using the specified transport.
2. Complete the initialization handshake.
3. Call `tools/list`, `resources/list`, and `prompts/list`.
4. Construct the snapshot object.
5. Compute the content hash.
6. Write to the output file (or stdout).
7. Disconnect from the server.

**Error handling:**
- If the server fails to start or connect within 30 seconds, exit with code 2.
- If a list call fails (e.g., server doesn't support resources), omit that section with an empty object and log a warning.
- If `--output` is not specified and stdout is a TTY, print the snapshot as formatted JSON. If piped, print compact JSON.

### 3.3 `mcpdiff diff`

Compares two snapshots and reports changes.

```
mcpdiff diff <before> <after> [options]

Arguments:
  before                Path to the "before" snapshot file
  after                 Path to the "after" snapshot file

Options:
  --severity <level>    Minimum severity to report: safe | warning | breaking (default: safe)
  --fail-on <level>     Exit with code 1 if changes at this level or above: safe | warning | breaking (default: breaking)
  --output, -o <path>   Write report to file instead of stdout

Examples:
  mcpdiff diff v1.mcpc.json v2.mcpc.json
  mcpdiff diff v1.mcpc.json v2.mcpc.json --format json -o diff-report.json
  mcpdiff diff v1.mcpc.json v2.mcpc.json --fail-on warning
```

**Exit codes:**
- `0` — No changes at or above the `--fail-on` level.
- `1` — Changes at or above the `--fail-on` level detected.
- `2` — Error (invalid files, missing arguments, etc.).

### 3.4 `mcpdiff inspect`

Displays a summary of a snapshot file.

```
mcpdiff inspect <snapshot> [options]

Arguments:
  snapshot              Path to a snapshot file

Options:
  --tools               List all tools with their descriptions
  --resources           List all resources
  --prompts             List all prompts
  --schema <tool>       Show the full input schema for a specific tool

Examples:
  mcpdiff inspect snapshot.mcpc.json
  mcpdiff inspect snapshot.mcpc.json --tools
  mcpdiff inspect snapshot.mcpc.json --schema create_contact
```

---

## 4. Diff Report Format (JSON)

When using `--format json`, the diff command outputs:

```typescript
interface DiffReport {
  /** Metadata about the comparison. */
  meta: {
    before: { serverName: string; serverVersion: string; contentHash: string; capturedAt: string };
    after: { serverName: string; serverVersion: string; contentHash: string; capturedAt: string };
    generatedAt: string;
    tool: string;
  };

  /** Summary counts by severity. */
  summary: {
    breaking: number;
    warning: number;
    safe: number;
    total: number;
  };

  /** Individual changes. */
  changes: Array<{
    /** Unique identifier for this change. */
    id: string;
    /** What changed: "tool" | "resource" | "prompt" */
    category: string;
    /** Name of the tool/resource/prompt. */
    name: string;
    /** Classification: "breaking" | "warning" | "safe" */
    severity: string;
    /** What kind of change: "added" | "removed" | "modified" */
    type: string;
    /** Human-readable description of the change. */
    message: string;
    /** The specific path within the schema that changed, if applicable. */
    path?: string;
    /** The old value, if applicable. */
    before?: unknown;
    /** The new value, if applicable. */
    after?: unknown;
  }>;
}
```

---

## 5. Contract Signing & Integrity

### 5.1 Detached Signature Format (`.mcpc.sig`)

A detached signature file is a JSON file stored alongside the `.mcpc.json` snapshot. It covers the `contentHash` field, which itself is a SHA-256 of the canonical tools/resources/prompts content.

```typescript
interface DetachedSignature {
  /** Format version for the signature file. Currently "1.0.0". */
  signatureVersion: "1.0.0";
  /** The cryptographic algorithm used: "Ed25519" or "RSA-PSS-SHA256". */
  algorithm: "Ed25519" | "RSA-PSS-SHA256";
  /** The contentHash that was signed (binding reference to the snapshot). */
  contentHash: string;
  /** Base64-encoded signature bytes. */
  signature: string;
  /** ISO 8601 timestamp of when the signature was created. */
  signedAt: string;
}
```

**File naming convention:** Replace `.mcpc.json` with `.mcpc.sig` (e.g., `baseline.mcpc.json` → `baseline.mcpc.sig`).

### 5.2 Supported Algorithms

| Algorithm | Key Type | Signature | Padding |
|-----------|----------|-----------|---------|
| `Ed25519` | Ed25519 | `crypto.sign(null, data, key)` | N/A |
| `RSA-PSS-SHA256` | RSA (2048+ bits) | `crypto.sign("sha256", data, key)` | RSA_PKCS1_PSS_PADDING |

Key types are auto-detected from the PEM file using `crypto.createPrivateKey()` / `crypto.createPublicKey()`.

### 5.3 Signing Process

1. Read the snapshot file and verify its `contentHash` matches the recomputed hash. Refuse to sign if mismatched.
2. Detect the algorithm from the private key PEM.
3. Sign the `contentHash` string (UTF-8 encoded) with the private key.
4. Write the `DetachedSignature` as a `.mcpc.sig` JSON file.

### 5.4 Verification Process

Verification performs three checks in order:

1. **Content hash integrity** — Recompute the hash from `tools`, `resources`, `prompts` and compare to `snapshot.contentHash`. Fails if the snapshot content was tampered.
2. **Hash binding** — Compare `snapshot.contentHash` to `signature.contentHash`. Fails if the signature was created for a different snapshot.
3. **Cryptographic verification** — Verify the signature bytes against the public key. Fails if signed by a different key or if signature bytes were tampered.

### 5.5 Content Hash Verification

`mcpdiff verify-hash` provides a quick integrity check without keys:

1. Recompute the content hash from the snapshot's `tools`, `resources`, and `prompts`.
2. Compare to the stored `contentHash` field.
3. Exit 0 if they match, exit 1 if they don't.

### 5.6 CLI Commands

```
mcpdiff sign <snapshot> --key <private-key-path>
mcpdiff verify <snapshot> --key <public-key-path> [--signature <sig-path>]
mcpdiff verify-hash <snapshot>
```

### 5.7 CI Integration

The `ci` command accepts `--verify-signature` and `--signature-key <path>` to verify the baseline signature before diffing. Falls back to `MCP_SIGNATURE_KEY` environment variable (PEM content or file path).

The GitHub Action accepts `verify-signature` and `signature-key` inputs for the same purpose.

---

## 6. Contract Testing (`@mcp-contracts/test`)

The `@mcp-contracts/test` package tests that a live MCP server conforms to its contract. It connects to a server, runs conformance checks, and produces structured test reports.

### 6.1 Test Categories

| Category | What it tests |
|----------|---------------|
| **Schema conformance** | Compares live tool/resource/prompt schemas against the contract using the diff engine. Any breaking or warning-level deviation is a failure. |
| **Boundary inputs** | Auto-generates edge case inputs from each tool's JSON Schema (empty strings, zero/negative numbers, oversized payloads, missing required fields) and verifies the server handles them gracefully (no crashes or timeouts). |
| **Behavioral assertions** | User-defined predicate functions that validate tool outputs. Also supports a pluggable judge interface for LLM-as-judge evaluation (no LLM dependency shipped). |

### 6.2 CLI

```
mcp-test run <contract> [options]

Options:
  --command <cmd>          Server command for stdio transport
  --args <args...>         Arguments for the server command
  --url <url>              Server URL for streamable-http transport
  --sse                    Use SSE transport
  --header <header...>     Custom headers (Key: Value)
  --env <pairs...>         Environment variables (KEY=VALUE)
  --format <format>        Output format: terminal | json | markdown
  --no-conformance         Skip schema conformance tests
  --no-boundary            Skip boundary input tests
  --allow-extra-tools      Allow tools not in the contract
  --ignore-descriptions    Ignore description differences
  --skip-tools <names...>  Skip specific tools
  --timeout <ms>           Global timeout (default: 120000)
  -o, --output <path>      Write report to file

Exit codes:
  0 — All tests pass
  1 — One or more tests failed
  2 — Tool error (connection failure, invalid contract, etc.)
```

### 6.3 Vitest/Jest Integration

Custom matchers for use in existing test suites:

```typescript
import { expect } from "vitest";
import { setupMatchers, createTestServer } from "@mcp-contracts/test/matchers";

setupMatchers(expect);

const server = createTestServer({ transport: "stdio", command: "node", args: ["server.js"] });

beforeAll(() => server.connect());
afterAll(() => server.disconnect());

it("conforms to contract", async () => {
  await expect(server.config).toConformToContract(contract);
});
```

### 6.4 Test Report Format (JSON)

```typescript
interface TestReport {
  meta: {
    contractPath: string;
    serverName: string;
    serverVersion: string;
    runAt: string;
    tool: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    durationMs: number;
  };
  results: Array<{
    id: string;
    category: "conformance" | "boundary" | "assertion";
    toolName: string;
    status: "pass" | "fail" | "skip" | "error";
    description: string;
    message?: string;
    durationMs?: number;
    input?: Record<string, unknown>;
    output?: unknown;
    path?: string;
    expected?: unknown;
    actual?: unknown;
  }>;
}
```

---

## 7. Future Features

These are planned but not yet implemented. Listed here for context.

- **Transparency log** — Append-only history of contract versions.
- **Registry integration** — Publish contracts alongside servers in the MCP Registry.
