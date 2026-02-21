import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeContentHash, sortKeys } from "./hash.js";
import type { PromptContract, ResourceContract, ToolContract } from "./types.js";

describe("sortKeys", () => {
  it("returns primitives unchanged", () => {
    expect(sortKeys(null)).toBe(null);
    expect(sortKeys(42)).toBe(42);
    expect(sortKeys("hello")).toBe("hello");
    expect(sortKeys(true)).toBe(true);
  });

  it("sorts object keys alphabetically", () => {
    const input = { z: 1, a: 2, m: 3 };
    const result = sortKeys(input) as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(["a", "m", "z"]);
  });

  it("sorts nested object keys recursively", () => {
    const input = { b: { z: 1, a: 2 }, a: { y: 3, x: 4 } };
    const result = sortKeys(input) as Record<string, Record<string, unknown>>;
    expect(Object.keys(result)).toEqual(["a", "b"]);
    expect(Object.keys(result.a)).toEqual(["x", "y"]);
    expect(Object.keys(result.b)).toEqual(["a", "z"]);
  });

  it("handles arrays by sorting keys within each element", () => {
    const input = [
      { z: 1, a: 2 },
      { b: 3, a: 4 },
    ];
    const result = sortKeys(input) as Array<Record<string, unknown>>;
    expect(Object.keys(result[0])).toEqual(["a", "z"]);
    expect(Object.keys(result[1])).toEqual(["a", "b"]);
  });

  it("handles deeply nested structures", () => {
    const input = { c: { b: { a: [{ z: 1, a: 2 }] } } };
    const result = JSON.stringify(sortKeys(input));
    expect(result).toBe('{"c":{"b":{"a":[{"a":2,"z":1}]}}}');
  });
});

describe("computeContentHash", () => {
  const emptyTools: Record<string, ToolContract> = {};
  const emptyResources: Record<string, ResourceContract> = {};
  const emptyPrompts: Record<string, PromptContract> = {};

  it("returns a consistent hash for empty objects", () => {
    const hash = computeContentHash(emptyTools, emptyResources, emptyPrompts);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Calling again should produce the same hash
    const hash2 = computeContentHash(emptyTools, emptyResources, emptyPrompts);
    expect(hash).toBe(hash2);
  });

  it("returns the correct sha256 value for empty objects", () => {
    const expected = createHash("sha256")
      .update('{"prompts":{},"resources":{},"tools":{}}', "utf-8")
      .digest("hex");
    const hash = computeContentHash(emptyTools, emptyResources, emptyPrompts);
    expect(hash).toBe(`sha256:${expected}`);
  });

  it("produces the same hash regardless of key insertion order", () => {
    const toolsA: Record<string, ToolContract> = {
      alpha: { description: "First tool", inputSchema: { type: "object" } },
      beta: { description: "Second tool", inputSchema: { type: "object" } },
    };

    const toolsB: Record<string, ToolContract> = {
      beta: { description: "Second tool", inputSchema: { type: "object" } },
      alpha: { description: "First tool", inputSchema: { type: "object" } },
    };

    const hashA = computeContentHash(toolsA, emptyResources, emptyPrompts);
    const hashB = computeContentHash(toolsB, emptyResources, emptyPrompts);
    expect(hashA).toBe(hashB);
  });

  it("produces different hashes for different data", () => {
    const toolsA: Record<string, ToolContract> = {
      search: { description: "Search tool", inputSchema: { type: "object" } },
    };
    const toolsB: Record<string, ToolContract> = {
      query: { description: "Query tool", inputSchema: { type: "object" } },
    };

    const hashA = computeContentHash(toolsA, emptyResources, emptyPrompts);
    const hashB = computeContentHash(toolsB, emptyResources, emptyPrompts);
    expect(hashA).not.toBe(hashB);
  });

  it("handles realistic tool schemas", () => {
    const tools: Record<string, ToolContract> = {
      create_contact: {
        description: "Creates a new contact in the address book",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Full name of the contact" },
            email: { type: "string", format: "email", description: "Email address" },
            phone: { type: "string", description: "Phone number" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization",
            },
          },
          required: ["name", "email"],
          additionalProperties: false,
        },
      },
      search_contacts: {
        description: "Searches contacts by query string",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results", default: 10 },
          },
          required: ["query"],
        },
      },
    };

    const resources: Record<string, ResourceContract> = {
      "contacts://list": {
        description: "List of all contacts",
        mimeType: "application/json",
        isTemplate: false,
      },
    };

    const prompts: Record<string, PromptContract> = {
      summarize_contact: {
        description: "Summarize a contact's information",
        arguments: [{ name: "contactId", description: "ID of the contact", required: true }],
      },
    };

    const hash = computeContentHash(tools, resources, prompts);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Same data again → same hash
    const hash2 = computeContentHash(tools, resources, prompts);
    expect(hash).toBe(hash2);
  });

  it("is sensitive to nested schema differences", () => {
    const toolsA: Record<string, ToolContract> = {
      test: {
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
    };

    const toolsB: Record<string, ToolContract> = {
      test: {
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: { name: { type: "number" } },
        },
      },
    };

    const hashA = computeContentHash(toolsA, emptyResources, emptyPrompts);
    const hashB = computeContentHash(toolsB, emptyResources, emptyPrompts);
    expect(hashA).not.toBe(hashB);
  });

  it("sorts nested schema keys for consistent hashing", () => {
    const toolsA: Record<string, ToolContract> = {
      test: {
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: { b: { type: "string" }, a: { type: "number" } },
          required: ["a"],
        },
      },
    };

    const toolsB: Record<string, ToolContract> = {
      test: {
        description: "Test tool",
        inputSchema: {
          required: ["a"],
          type: "object",
          properties: { a: { type: "number" }, b: { type: "string" } },
        },
      },
    };

    const hashA = computeContentHash(toolsA, emptyResources, emptyPrompts);
    const hashB = computeContentHash(toolsB, emptyResources, emptyPrompts);
    expect(hashA).toBe(hashB);
  });
});
