import { describe, expect, it } from "vitest";
import { diffOutputSchema, diffSchemas } from "./diff-schema.js";
import type { JSONSchema } from "./types.js";

function inputDiff(before: JSONSchema, after: JSONSchema) {
  return diffSchemas("testTool", before, after, "inputSchema");
}

describe("diffSchemas — input schema changes", () => {
  it("detects required parameter added as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["name", "email"],
    };

    const changes = inputDiff(before, after);
    const added = changes.find((c) => c.id.includes("email.added"));
    expect(added).toBeDefined();
    expect(added?.severity).toBe("breaking");
  });

  it("detects required parameter removed as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["name", "email"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };

    const changes = inputDiff(before, after);
    const removed = changes.find((c) => c.id.includes("email.removed"));
    expect(removed).toBeDefined();
    expect(removed?.severity).toBe("warning");
  });

  it("detects optional parameter added as safe", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        nickname: { type: "string" },
      },
      required: ["name"],
    };

    const changes = inputDiff(before, after);
    const added = changes.find((c) => c.id.includes("nickname.added"));
    expect(added).toBeDefined();
    expect(added?.severity).toBe("safe");
  });

  it("detects optional parameter removed as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        nickname: { type: "string" },
      },
      required: ["name"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };

    const changes = inputDiff(before, after);
    const removed = changes.find((c) => c.id.includes("nickname.removed"));
    expect(removed).toBeDefined();
    expect(removed?.severity).toBe("warning");
  });

  it("detects parameter type changed as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { age: { type: "string" } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { age: { type: "number" } },
    };

    const changes = inputDiff(before, after);
    const typeChange = changes.find((c) => c.id.includes("typeChanged"));
    expect(typeChange).toBeDefined();
    expect(typeChange?.severity).toBe("breaking");
  });

  it("detects type widened as safe", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { value: { type: "string" } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { value: { type: ["string", "number"] } },
    };

    const changes = inputDiff(before, after);
    const widened = changes.find((c) => c.id.includes("typeWidened"));
    expect(widened).toBeDefined();
    expect(widened?.severity).toBe("safe");
  });

  it("detects type narrowed as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { value: { type: ["string", "number"] } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { value: { type: "string" } },
    };

    const changes = inputDiff(before, after);
    const narrowed = changes.find((c) => c.id.includes("typeNarrowed"));
    expect(narrowed).toBeDefined();
    expect(narrowed?.severity).toBe("breaking");
  });

  it("detects enum values removed as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "inactive", "pending"] } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "inactive"] } },
    };

    const changes = inputDiff(before, after);
    const removed = changes.find((c) => c.id.includes("enumValuesRemoved"));
    expect(removed).toBeDefined();
    expect(removed?.severity).toBe("breaking");
  });

  it("detects enum values added as safe", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "inactive"] } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "inactive", "pending"] } },
    };

    const changes = inputDiff(before, after);
    const added = changes.find((c) => c.id.includes("enumValuesAdded"));
    expect(added).toBeDefined();
    expect(added?.severity).toBe("safe");
  });

  it("detects parameter description changed as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { query: { type: "string", description: "Full-text search query" } },
    };

    const changes = inputDiff(before, after);
    const desc = changes.find((c) => c.id.includes("descriptionChanged"));
    expect(desc).toBeDefined();
    expect(desc?.severity).toBe("warning");
  });

  it("detects parameter default changed as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { limit: { type: "number", default: 10 } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { limit: { type: "number", default: 50 } },
    };

    const changes = inputDiff(before, after);
    const def = changes.find((c) => c.id.includes("defaultChanged"));
    expect(def).toBeDefined();
    expect(def?.severity).toBe("warning");
  });

  it("detects format added as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { email: { type: "string" } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { email: { type: "string", format: "email" } },
    };

    const changes = inputDiff(before, after);
    const fmt = changes.find((c) => c.id.includes("formatChanged"));
    expect(fmt).toBeDefined();
    expect(fmt?.severity).toBe("warning");
  });

  it("detects format changed as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { date: { type: "string", format: "date" } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { date: { type: "string", format: "date-time" } },
    };

    const changes = inputDiff(before, after);
    const fmt = changes.find((c) => c.id.includes("formatChanged"));
    expect(fmt).toBeDefined();
    expect(fmt?.severity).toBe("warning");
  });

  it("detects additionalProperties changed from true/unset to false as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: false,
    };

    const changes = inputDiff(before, after);
    const ap = changes.find((c) => c.id.includes("additionalProperties"));
    expect(ap).toBeDefined();
    expect(ap?.severity).toBe("breaking");
  });

  it("detects additionalProperties changed from false to true/unset as safe", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: false,
    };
    const after: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
    };

    const changes = inputDiff(before, after);
    const ap = changes.find((c) => c.id.includes("additionalProperties"));
    expect(ap).toBeDefined();
    expect(ap?.severity).toBe("safe");
  });

  it("detects minimum made stricter as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { count: { type: "number", minimum: 0 } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { count: { type: "number", minimum: 1 } },
    };

    const changes = inputDiff(before, after);
    const c = changes.find((c) => c.id.includes("minimumStricter"));
    expect(c).toBeDefined();
    expect(c?.severity).toBe("breaking");
  });

  it("detects maximum made more lenient as safe", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { count: { type: "number", maximum: 100 } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { count: { type: "number", maximum: 200 } },
    };

    const changes = inputDiff(before, after);
    const c = changes.find((c) => c.id.includes("maximumLenient"));
    expect(c).toBeDefined();
    expect(c?.severity).toBe("safe");
  });

  it("detects maxLength made stricter as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { name: { type: "string", maxLength: 100 } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { name: { type: "string", maxLength: 50 } },
    };

    const changes = inputDiff(before, after);
    const c = changes.find((c) => c.id.includes("maxLengthStricter"));
    expect(c).toBeDefined();
    expect(c?.severity).toBe("breaking");
  });

  it("detects minItems made more lenient as safe", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { tags: { type: "array", minItems: 3 } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { tags: { type: "array", minItems: 1 } },
    };

    const changes = inputDiff(before, after);
    const c = changes.find((c) => c.id.includes("minItemsLenient"));
    expect(c).toBeDefined();
    expect(c?.severity).toBe("safe");
  });

  it("recurses into nested object schemas", () => {
    const before: JSONSchema = {
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
          required: ["street"],
        },
      },
    };
    const after: JSONSchema = {
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            zip: { type: "string" },
          },
          required: ["street", "zip"],
        },
      },
    };

    const changes = inputDiff(before, after);
    const zipAdded = changes.find((c) => c.id.includes("zip.added"));
    expect(zipAdded).toBeDefined();
    expect(zipAdded?.severity).toBe("breaking");
    expect(zipAdded?.path).toContain("address");
  });

  it("detects parameter becoming required as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["name"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["name", "email"],
    };

    const changes = inputDiff(before, after);
    const req = changes.find((c) => c.id.includes("requiredAdded"));
    expect(req).toBeDefined();
    expect(req?.severity).toBe("breaking");
  });

  it("detects parameter becoming optional as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["name", "email"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["name"],
    };

    const changes = inputDiff(before, after);
    const req = changes.find((c) => c.id.includes("requiredRemoved"));
    expect(req).toBeDefined();
    expect(req?.severity).toBe("warning");
  });

  it("reports no changes for identical schemas", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number", minimum: 0, maximum: 150 },
      },
      required: ["name"],
    };

    const changes = inputDiff(schema, schema);
    expect(changes).toHaveLength(0);
  });
});

describe("diffOutputSchema", () => {
  it("detects output schema added as safe", () => {
    const output: JSONSchema = {
      type: "object",
      properties: { result: { type: "string" } },
    };
    const changes = diffOutputSchema("testTool", undefined, output);
    expect(changes).toHaveLength(1);
    expect(changes[0].severity).toBe("safe");
    expect(changes[0].type).toBe("added");
  });

  it("detects output schema removed as breaking", () => {
    const output: JSONSchema = {
      type: "object",
      properties: { result: { type: "string" } },
    };
    const changes = diffOutputSchema("testTool", output, undefined);
    expect(changes).toHaveLength(1);
    expect(changes[0].severity).toBe("breaking");
    expect(changes[0].type).toBe("removed");
  });

  it("detects required output field added as warning", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" },
      },
      required: ["id", "status"],
    };
    const changes = diffOutputSchema("testTool", before, after);
    const added = changes.find((c) => c.id.includes("status.added"));
    expect(added).toBeDefined();
    expect(added?.severity).toBe("warning");
  });

  it("detects required output field removed as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" },
      },
      required: ["id", "status"],
    };
    const after: JSONSchema = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };
    const changes = diffOutputSchema("testTool", before, after);
    const removed = changes.find((c) => c.id.includes("status.removed"));
    expect(removed).toBeDefined();
    expect(removed?.severity).toBe("breaking");
  });

  it("detects output field type changed as breaking", () => {
    const before: JSONSchema = {
      type: "object",
      properties: { count: { type: "number" } },
    };
    const after: JSONSchema = {
      type: "object",
      properties: { count: { type: "string" } },
    };
    const changes = diffOutputSchema("testTool", before, after);
    const typeChange = changes.find((c) => c.id.includes("typeChanged"));
    expect(typeChange).toBeDefined();
    expect(typeChange?.severity).toBe("breaking");
  });

  it("reports no changes when both are undefined", () => {
    const changes = diffOutputSchema("testTool", undefined, undefined);
    expect(changes).toHaveLength(0);
  });

  it("reports no changes for identical output schemas", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
    };
    const changes = diffOutputSchema("testTool", schema, schema);
    expect(changes).toHaveLength(0);
  });
});
