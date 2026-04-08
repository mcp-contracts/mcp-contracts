/**
 * Boundary input testing.
 *
 * Auto-generates edge case inputs from JSON Schema and verifies
 * that the server handles them gracefully (no crashes or timeouts).
 */

import type { JSONSchema, MCPContractSnapshot } from "@mcp-contracts/core";
import { callServerTool } from "./mcp-client.js";
import type { BoundaryOptions, BoundaryTestCase, TestConnection, TestResult } from "./types.js";

const DEFAULT_MAX_STRING_SIZE = 10_000;
const DEFAULT_CALL_TIMEOUT_MS = 10_000;

/**
 * Generates a minimal valid value for a JSON Schema type.
 *
 * @param schema - The property schema.
 * @returns A type-appropriate default value.
 */
function defaultForType(schema: JSONSchema): unknown {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "string":
      return schema.enum ? schema.enum[0] : "test";
    case "number":
    case "integer":
      return schema.minimum != null ? schema.minimum : 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "test";
  }
}

/**
 * Generates a minimal valid input object from a JSON Schema.
 *
 * @param schema - The tool's inputSchema.
 * @returns An object with all required fields set to defaults.
 */
export function generateValidBaseInput(schema: JSONSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [name, propSchema] of Object.entries(properties)) {
    if (required.has(name)) {
      result[name] = defaultForType(propSchema as JSONSchema);
    }
  }
  return result;
}

/**
 * Generates boundary test cases for string properties.
 *
 * @param propName - The property name.
 * @param propSchema - The property schema.
 * @param base - Base valid input.
 * @param maxStringSize - Max string size for oversized tests.
 * @returns Array of boundary test cases.
 */
function stringBoundaries(
  propName: string,
  propSchema: JSONSchema,
  base: Record<string, unknown>,
  maxStringSize: number,
): BoundaryTestCase[] {
  const cases: BoundaryTestCase[] = [];

  cases.push({
    description: `empty string for "${propName}"`,
    category: "empty",
    input: { ...base, [propName]: "" },
  });

  cases.push({
    description: `special characters for "${propName}"`,
    category: "special_chars",
    input: { ...base, [propName]: '<script>alert("xss")</script>\x00\uFFFF' },
  });

  cases.push({
    description: `oversized string for "${propName}"`,
    category: "oversized",
    input: { ...base, [propName]: "x".repeat(maxStringSize) },
  });

  if (propSchema.minLength != null) {
    const boundary = propSchema.minLength - 1;
    if (boundary >= 0) {
      cases.push({
        description: `below minLength for "${propName}" (${boundary} chars)`,
        category: "type_boundary",
        input: { ...base, [propName]: "x".repeat(boundary) },
      });
    }
  }

  if (propSchema.maxLength != null) {
    cases.push({
      description: `above maxLength for "${propName}" (${propSchema.maxLength + 1} chars)`,
      category: "type_boundary",
      input: { ...base, [propName]: "x".repeat(propSchema.maxLength + 1) },
    });
  }

  return cases;
}

/**
 * Generates boundary test cases for number/integer properties.
 *
 * @param propName - The property name.
 * @param propSchema - The property schema.
 * @param base - Base valid input.
 * @returns Array of boundary test cases.
 */
function numberBoundaries(
  propName: string,
  propSchema: JSONSchema,
  base: Record<string, unknown>,
): BoundaryTestCase[] {
  const cases: BoundaryTestCase[] = [];

  cases.push({
    description: `zero for "${propName}"`,
    category: "zero",
    input: { ...base, [propName]: 0 },
  });

  cases.push({
    description: `negative for "${propName}"`,
    category: "negative",
    input: { ...base, [propName]: -1 },
  });

  cases.push({
    description: `MAX_SAFE_INTEGER for "${propName}"`,
    category: "type_boundary",
    input: { ...base, [propName]: Number.MAX_SAFE_INTEGER },
  });

  if (propSchema.minimum != null) {
    cases.push({
      description: `below minimum for "${propName}" (${propSchema.minimum - 1})`,
      category: "type_boundary",
      input: { ...base, [propName]: propSchema.minimum - 1 },
    });
  }

  if (propSchema.maximum != null) {
    cases.push({
      description: `above maximum for "${propName}" (${propSchema.maximum + 1})`,
      category: "type_boundary",
      input: { ...base, [propName]: propSchema.maximum + 1 },
    });
  }

  return cases;
}

/**
 * Generates boundary test cases for a single tool from its input schema.
 *
 * @param toolName - The tool name.
 * @param inputSchema - The tool's input JSON Schema.
 * @param options - Boundary testing options.
 * @returns Array of generated test cases.
 */
export function generateBoundaryInputs(
  toolName: string,
  inputSchema: JSONSchema,
  options?: BoundaryOptions,
): BoundaryTestCase[] {
  const maxStringSize = options?.maxStringSize ?? DEFAULT_MAX_STRING_SIZE;
  const base = generateValidBaseInput(inputSchema);
  const properties = inputSchema.properties ?? {};
  const required = new Set(inputSchema.required ?? []);
  const cases: BoundaryTestCase[] = [];

  for (const [propName, rawSchema] of Object.entries(properties)) {
    const propSchema = rawSchema as JSONSchema;
    const type = Array.isArray(propSchema.type) ? propSchema.type[0] : propSchema.type;

    if (type === "string") {
      cases.push(...stringBoundaries(propName, propSchema, base, maxStringSize));
    } else if (type === "number" || type === "integer") {
      cases.push(...numberBoundaries(propName, propSchema, base));
    }

    // Missing optional field
    if (!required.has(propName)) {
      const withoutProp = { ...base };
      delete withoutProp[propName];
      cases.push({
        description: `missing optional "${propName}"`,
        category: "missing_optional",
        input: withoutProp,
      });
    }
  }

  // Missing required fields (negative tests)
  for (const reqName of required) {
    const withoutReq = { ...base };
    delete withoutReq[reqName];
    cases.push({
      description: `missing required "${reqName}"`,
      category: "missing_required",
      input: withoutReq,
    });
  }

  // Custom inputs
  const customInputs = options?.customInputs?.[toolName];
  if (customInputs) {
    for (const custom of customInputs) {
      cases.push({
        description: `custom input for "${toolName}"`,
        category: "custom",
        input: custom,
      });
    }
  }

  return cases;
}

/**
 * Runs boundary input tests for all tools in a contract.
 *
 * For each tool, generates edge case inputs and calls the server.
 * Tests pass if the server returns any valid MCP response (success or error).
 * Tests fail if the server crashes, hangs, or returns a malformed response.
 *
 * @param connection - The active MCP server connection.
 * @param contract - The loaded contract snapshot.
 * @param options - Boundary testing options.
 * @returns Array of TestResult for each boundary test.
 */
export async function runBoundaryTests(
  connection: TestConnection,
  contract: MCPContractSnapshot,
  options: BoundaryOptions = {},
): Promise<TestResult[]> {
  const skipTools = new Set(options.skipTools ?? []);
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const results: TestResult[] = [];

  for (const [toolName, tool] of Object.entries(contract.tools)) {
    if (skipTools.has(toolName)) {
      results.push({
        id: `boundary.${toolName}.skipped`,
        category: "boundary",
        toolName,
        status: "skip",
        description: `Boundary tests for "${toolName}" skipped by configuration`,
      });
      continue;
    }

    const testCases = generateBoundaryInputs(toolName, tool.inputSchema, options);

    for (const testCase of testCases) {
      const startTime = Date.now();
      const id = `boundary.${toolName}.${testCase.category}.${Object.keys(testCase.input).join("_") || "empty"}`;

      try {
        const output = await callServerTool(connection, toolName, testCase.input, callTimeoutMs);
        results.push({
          id,
          category: "boundary",
          toolName,
          status: "pass",
          description: `${toolName}: ${testCase.description}`,
          durationMs: Date.now() - startTime,
          input: testCase.input,
          output,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          id,
          category: "boundary",
          toolName,
          status: "fail",
          description: `${toolName}: ${testCase.description}`,
          message: `Server error: ${message}`,
          durationMs: Date.now() - startTime,
          input: testCase.input,
        });
      }
    }
  }

  return results;
}
