# @mcp-contracts/test

Contract conformance testing for MCP servers. Verify that a live server matches its `.mcpc.json` contract — schema conformance, boundary inputs, and behavioral assertions.

## Install

```bash
npm install @mcp-contracts/test
```

## CLI

Test any MCP server against a contract:

```bash
# Stdio server
mcp-test run contract.mcpc.json --command node --args server.js

# HTTP server
mcp-test run contract.mcpc.json --url http://localhost:3000/mcp

# With options
mcp-test run contract.mcpc.json --command node --args server.js \
  --allow-extra-tools \
  --skip-tools dangerous_tool \
  --format terminal
```

Exit codes: `0` = all pass, `1` = failures, `2` = error.

## Library Usage

```typescript
import {
  runContractTests,
  formatTestTerminal,
} from "@mcp-contracts/test";

const report = await runContractTests({
  contract,
  contractPath: "contract.mcpc.json",
  server: { transport: "stdio", command: "node", args: ["server.js"] },
});

console.log(formatTestTerminal(report));
// 57 tests: 57 passed (0.1s)
```

### Schema Conformance

Compares live server schemas against the contract using the [diff engine](https://www.npmjs.com/package/@mcp-contracts/core). Any breaking or warning deviation is a failure.

```typescript
import { connectToServer, closeConnection } from "@mcp-contracts/test";
import { runSchemaConformance } from "@mcp-contracts/test";

const connection = await connectToServer({
  transport: "stdio",
  command: "node",
  args: ["server.js"],
});

const results = await runSchemaConformance(connection, contract, {
  allowExtraTools: true,
  ignoreDescriptions: false,
  skipTools: ["internal_tool"],
});

await closeConnection(connection);
```

### Boundary Input Testing

Auto-generates edge case inputs from each tool's JSON Schema and verifies the server handles them gracefully (no crashes or timeouts).

```typescript
import { runBoundaryTests } from "@mcp-contracts/test";

const results = await runBoundaryTests(connection, contract, {
  maxStringSize: 10000,
  callTimeoutMs: 5000,
  skipTools: ["slow_tool"],
  customInputs: {
    create_contact: [{ name: "", email: "not-an-email" }],
  },
});
```

Generated test categories: empty strings, special characters, oversized payloads, zero/negative numbers, missing optional fields, missing required fields, min/max boundary values.

### Behavioral Assertions

User-defined predicate functions that validate tool outputs:

```typescript
import { runPredicateAssertions } from "@mcp-contracts/test";

const results = await runPredicateAssertions(connection, [
  {
    toolName: "get_contact",
    description: "Returns a contact with an ID",
    input: { id: "c_001" },
    assert: (result) => {
      if (!result.text) return false;
      const data = JSON.parse(result.text);
      return typeof data.id === "string";
    },
  },
]);
```

#### LLM-as-Judge

The judge interface is pluggable — bring your own LLM client:

```typescript
import { runJudgeAssertions } from "@mcp-contracts/test";

const results = await runJudgeAssertions(connection, [
  {
    toolName: "search_contacts",
    description: "Returns relevant results",
    input: { query: "Jane" },
    expectation: "Results should contain contacts matching 'Jane'",
    judge: async ({ output, expectation }) => {
      // Use any LLM client here
      const response = await myLLM.evaluate(output.text, expectation);
      return { pass: response.matches, reason: response.explanation };
    },
  },
]);
```

## Vitest/Jest Integration

Custom matchers for existing test suites:

```typescript
import { expect, describe, it, beforeAll, afterAll } from "vitest";
import { setupMatchers, createTestServer } from "@mcp-contracts/test/matchers";

setupMatchers(expect);

const server = createTestServer({
  transport: "stdio",
  command: "node",
  args: ["server.js"],
});

beforeAll(() => server.connect());
afterAll(() => server.disconnect());

describe("contract", () => {
  it("conforms to contract", async () => {
    await expect(server.config).toConformToContract(contract);
  });

  it("handles boundary inputs", async () => {
    await expect(server.config).toHandleBoundaryInputs(contract);
  });
});
```

### Output Formats

All three output formats are supported:

```typescript
import {
  formatTestJson,
  formatTestTerminal,
  formatTestMarkdown,
} from "@mcp-contracts/test";

formatTestTerminal(report); // Colored terminal output
formatTestJson(report);     // Pretty-printed JSON
formatTestMarkdown(report); // GitHub-compatible markdown
```

---
*mcp-contracts is an open-source project (MIT license). It's community tooling for the MCP ecosystem, not affiliated with Anthropic or the MCP project. Contributions and feedback are welcome.*

## License

MIT
