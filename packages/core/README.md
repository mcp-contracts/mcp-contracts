# @mcp-contracts/core

Snapshot, diff, and classify MCP tool schema changes. This is the core library behind [`mcpdiff`](https://www.npmjs.com/package/@mcp-contracts/cli).

## Install

```bash
npm install @mcp-contracts/core
```

## Usage

```typescript
import {
  createSnapshot,
  diffSnapshots,
  formatTerminal,
} from "@mcp-contracts/core";

// Create a snapshot from raw MCP server data
const snapshot = createSnapshot({
  serverName: "my-server",
  serverVersion: "1.0.0",
  tools: rawTools,
  resources: rawResources,
  prompts: rawPrompts,
});

// Diff two snapshots
const report = diffSnapshots(before, after);

// Format for display
console.log(formatTerminal(report));
```

### API

- **`createSnapshot(params)`** — Build a versioned `.mcpc.json` snapshot from raw MCP data
- **`diffSnapshots(before, after, options?)`** — Compare two snapshots and classify every change by severity
- **`computeContentHash(snapshot)`** — Generate a deterministic content hash for a snapshot
- **`formatTerminal(report)`** / **`formatMarkdown(report)`** / **`formatJson(report)`** — Format a diff report for output

### Change Classification

Every detected change is classified as one of:

| Severity | Meaning | Examples |
|----------|---------|---------|
| **breaking** | Will break existing consumers | Required param added, tool removed |
| **warning** | Needs human review | Description changed (potential tool poisoning) |
| **safe** | Non-breaking | New tool added, optional param added |

See the [full specification](https://github.com/mcp-contracts/mcp-contracts/blob/main/SPEC.md) for classification rules.

---
*mcp-contracts is an open-source project (MIT license). It's community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
