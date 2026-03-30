import type { JSONSchema } from "@mcp-contracts/core";
import { describe, expect, it, vi } from "vitest";
import { generateBoundaryInputs, generateValidBaseInput } from "./boundary-inputs.js";
import type { TestConnection } from "./types.js";

describe("generateValidBaseInput", () => {
  it("generates defaults for required string fields", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name", "age"],
    };
    const input = generateValidBaseInput(schema);
    expect(input).toEqual({ name: "test", age: 1 });
  });

  it("skips optional fields", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        nickname: { type: "string" },
      },
      required: ["name"],
    };
    const input = generateValidBaseInput(schema);
    expect(input).toEqual({ name: "test" });
    expect(input).not.toHaveProperty("nickname");
  });

  it("uses enum first value for string with enum", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { format: { type: "string", enum: ["csv", "json"] } },
      required: ["format"],
    };
    const input = generateValidBaseInput(schema);
    expect(input).toEqual({ format: "csv" });
  });

  it("uses minimum for number with minimum", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { limit: { type: "number", minimum: 1 } },
      required: ["limit"],
    };
    const input = generateValidBaseInput(schema);
    expect(input).toEqual({ limit: 1 });
  });

  it("handles empty properties", () => {
    const schema: JSONSchema = { type: "object" };
    const input = generateValidBaseInput(schema);
    expect(input).toEqual({});
  });
});

describe("generateBoundaryInputs", () => {
  const stringSchema: JSONSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      email: { type: "string", format: "email" },
    },
    required: ["name", "email"],
  };

  it("generates empty string cases for string properties", () => {
    const cases = generateBoundaryInputs("tool1", stringSchema);
    const empty = cases.filter((c) => c.category === "empty");
    expect(empty.length).toBeGreaterThanOrEqual(2);
    expect(empty[0]?.input.name).toBe("");
  });

  it("generates special character cases", () => {
    const cases = generateBoundaryInputs("tool1", stringSchema);
    const special = cases.filter((c) => c.category === "special_chars");
    expect(special.length).toBeGreaterThanOrEqual(2);
  });

  it("generates oversized string cases", () => {
    const cases = generateBoundaryInputs("tool1", stringSchema, { maxStringSize: 100 });
    const oversized = cases.filter((c) => c.category === "oversized");
    expect(oversized.length).toBeGreaterThanOrEqual(2);
    const val = oversized[0]?.input.name as string;
    expect(val.length).toBe(100);
  });

  it("generates missing required cases", () => {
    const cases = generateBoundaryInputs("tool1", stringSchema);
    const missing = cases.filter((c) => c.category === "missing_required");
    expect(missing.length).toBe(2);
    expect(missing[0]?.input).not.toHaveProperty("name");
  });

  it("generates missing optional cases", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        nickname: { type: "string" },
      },
      required: ["name"],
    };
    const cases = generateBoundaryInputs("tool1", schema);
    const missing = cases.filter((c) => c.category === "missing_optional");
    expect(missing.length).toBe(1);
    expect(missing[0]?.description).toContain("nickname");
  });

  const numberSchema: JSONSchema = {
    type: "object",
    properties: {
      count: { type: "number", minimum: 1, maximum: 100 },
    },
    required: ["count"],
  };

  it("generates zero case for number properties", () => {
    const cases = generateBoundaryInputs("tool1", numberSchema);
    const zero = cases.filter((c) => c.category === "zero");
    expect(zero.length).toBe(1);
    expect(zero[0]?.input.count).toBe(0);
  });

  it("generates negative case for number properties", () => {
    const cases = generateBoundaryInputs("tool1", numberSchema);
    const neg = cases.filter((c) => c.category === "negative");
    expect(neg.length).toBe(1);
    expect(neg[0]?.input.count).toBe(-1);
  });

  it("generates boundary cases for min/max", () => {
    const cases = generateBoundaryInputs("tool1", numberSchema);
    const boundary = cases.filter((c) => c.category === "type_boundary");
    // MAX_SAFE_INTEGER + below minimum + above maximum
    expect(boundary.length).toBe(3);
  });

  it("includes custom inputs", () => {
    const cases = generateBoundaryInputs("tool1", stringSchema, {
      customInputs: { tool1: [{ name: "custom", email: "custom@test.com" }] },
    });
    const custom = cases.filter((c) => c.category === "custom");
    expect(custom.length).toBe(1);
    expect(custom[0]?.input.name).toBe("custom");
  });

  it("generates minLength/maxLength boundary cases", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        code: { type: "string", minLength: 3, maxLength: 10 },
      },
      required: ["code"],
    };
    const cases = generateBoundaryInputs("tool1", schema);
    const boundary = cases.filter((c) => c.category === "type_boundary");
    expect(boundary.length).toBe(2);
    const belowMin = boundary.find((c) => c.description.includes("below minLength"));
    expect(belowMin).toBeDefined();
    expect((belowMin?.input.code as string).length).toBe(2);
  });
});

describe("runBoundaryTests", () => {
  it("skips tools in skipTools list", async () => {
    const { runBoundaryTests } = await import("./boundary-inputs.js");

    const contract = {
      snapshotVersion: "1.0.0" as const,
      capturedAt: "2026-01-01T00:00:00Z",
      contentHash: "sha256:test",
      server: { name: "t", version: "1.0", protocolVersion: "2025-11-25", capabilities: {} },
      capture: { transport: "stdio", tool: "test" },
      tools: {
        skipped_tool: {
          description: "skip me",
          inputSchema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        },
      },
      resources: {},
      prompts: {},
    };

    const connection = {
      client: {} as TestConnection["client"],
      transport: { close: vi.fn() } as unknown as TestConnection["transport"],
      serverName: "test",
      serverVersion: "1.0",
      protocolVersion: "2025-11-25",
    };

    const results = await runBoundaryTests(connection, contract, {
      skipTools: ["skipped_tool"],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("skip");
  });
});
