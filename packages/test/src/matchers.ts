/**
 * @mcp-contracts/test/matchers
 *
 * Custom Vitest/Jest matchers for MCP contract testing.
 * Also provides a managed test server helper for lifecycle management.
 *
 * @example
 * ```typescript
 * // vitest.setup.ts
 * import { setupMatchers } from "@mcp-contracts/test/matchers";
 * setupMatchers();
 * ```
 *
 * @example
 * ```typescript
 * import { createTestServer } from "@mcp-contracts/test/matchers";
 * import contract from "./contract.mcpc.json";
 *
 * const server = createTestServer({ transport: "stdio", command: "node server.js" });
 *
 * beforeAll(() => server.connect());
 * afterAll(() => server.disconnect());
 *
 * it("conforms to contract", async () => {
 *   await expect(server.config).toConformToContract(contract);
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { MCPContractSnapshot } from "@mcp-contracts/core";
import { closeConnection, connectToServer } from "./mcp-client.js";
import { runSchemaConformance } from "./schema-conformance.js";
import type {
  BoundaryOptions,
  ConformanceOptions,
  ManagedTestServer,
  TestConnection,
  TestServerConfig,
} from "./types.js";

/**
 * Formats failed test results into a human-readable message.
 *
 * @param results - Array of test results.
 * @returns Formatted failure message.
 */
function formatFailures(
  results: Array<{ status: string; description: string; message?: string }>,
): string {
  return results
    .filter((r) => r.status === "fail" || r.status === "error")
    .map((r) => `  - ${r.description}${r.message ? `: ${r.message}` : ""}`)
    .join("\n");
}

/** The subset of expect we need — works with both Vitest and Jest. */
interface ExpectExtendable {
  extend: (matchers: Record<string, (...args: never[]) => unknown>) => void;
}

/**
 * Sets up custom Vitest/Jest matchers for MCP contract testing.
 *
 * Pass the `expect` function from your test framework. If omitted,
 * falls back to the global `expect`.
 *
 * @param expectFn - The test framework's expect function (from vitest or jest).
 *
 * @example
 * ```typescript
 * import { expect } from "vitest";
 * import { setupMatchers } from "@mcp-contracts/test/matchers";
 * setupMatchers(expect);
 * ```
 */
export function setupMatchers(expectFn?: ExpectExtendable): void {
  // biome-ignore lint/suspicious/noExplicitAny: accessing test framework global
  const resolvedExpect = expectFn ?? ((globalThis as any).expect as ExpectExtendable | undefined);

  if (!resolvedExpect || typeof resolvedExpect.extend !== "function") {
    throw new Error(
      "setupMatchers() requires expect with extend(). " +
        "Pass the expect function: setupMatchers(expect) or ensure a global expect is available.",
    );
  }

  resolvedExpect.extend({
    async toConformToContract(
      received: TestServerConfig,
      contract: MCPContractSnapshot,
      options?: ConformanceOptions,
    ) {
      const connection = await connectToServer(received);
      try {
        const results = await runSchemaConformance(connection, contract, options ?? {});
        const pass = results.every((r) => r.status === "pass" || r.status === "skip");
        return {
          pass,
          message: () =>
            pass
              ? "Expected server NOT to conform to contract, but it does"
              : `Server does not conform to contract:\n${formatFailures(results)}`,
        };
      } finally {
        await closeConnection(connection);
      }
    },

    async toHandleBoundaryInputs(
      received: TestServerConfig,
      contract: MCPContractSnapshot,
      options?: BoundaryOptions,
    ) {
      const { runBoundaryTests } = await import("./boundary-inputs.js");
      const connection = await connectToServer(received);
      try {
        const results = await runBoundaryTests(connection, contract, options ?? {});
        const pass = results.every((r) => r.status === "pass" || r.status === "skip");
        return {
          pass,
          message: () =>
            pass
              ? "Expected server NOT to handle boundary inputs, but it does"
              : `Server failed boundary input tests:\n${formatFailures(results)}`,
        };
      } finally {
        await closeConnection(connection);
      }
    },
  });
}

/**
 * Creates a managed test server connection for use in test suites.
 *
 * Provides connect/disconnect lifecycle methods for use with
 * beforeAll/afterAll in test frameworks.
 *
 * @param config - Server connection configuration.
 * @returns A ManagedTestServer with lifecycle methods.
 */
export function createTestServer(config: TestServerConfig): ManagedTestServer {
  let connection: TestConnection | undefined;

  return {
    config,

    async connect(): Promise<void> {
      connection = await connectToServer(config);
    },

    async disconnect(): Promise<void> {
      if (connection) {
        await closeConnection(connection);
        connection = undefined;
      }
    },

    getConnection(): TestConnection {
      if (!connection) {
        throw new Error("Not connected. Call connect() first (typically in beforeAll).");
      }
      return connection;
    },
  };
}

/**
 * Type augmentation for Vitest and Jest.
 *
 * To get type support, add to your tsconfig.json:
 * ```json
 * { "compilerOptions": { "types": ["@mcp-contracts/test/matchers"] } }
 * ```
 *
 * Or import this module in your setup file:
 * ```typescript
 * import "@mcp-contracts/test/matchers";
 * ```
 */
export interface ContractMatchers {
  /**
   * Asserts that a server conforms to the given contract.
   *
   * @param contract - The contract snapshot to test against.
   * @param options - Conformance testing options.
   */
  toConformToContract(contract: MCPContractSnapshot, options?: ConformanceOptions): Promise<void>;

  /**
   * Asserts that a server handles boundary inputs gracefully.
   *
   * @param contract - The contract snapshot to generate inputs from.
   * @param options - Boundary testing options.
   */
  toHandleBoundaryInputs(contract: MCPContractSnapshot, options?: BoundaryOptions): Promise<void>;
}
