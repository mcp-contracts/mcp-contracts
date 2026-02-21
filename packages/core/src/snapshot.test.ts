import { describe, expect, it, vi } from "vitest";
import { computeContentHash } from "./hash.js";
import {
  type CreateSnapshotParams,
  type RawPrompt,
  type RawResource,
  type RawResourceTemplate,
  type RawTool,
  createSnapshot,
  normalizePrompts,
  normalizeResources,
  normalizeTools,
} from "./snapshot.js";

const minimalServer = {
  name: "test-server",
  version: "1.0.0",
  protocolVersion: "2025-03-26",
  capabilities: {},
};

const minimalCapture = {
  transport: "stdio",
  source: "node test-server.js",
  tool: "mcpdiff/0.1.0",
};

describe("normalizeTools", () => {
  it("converts an array of tools into a keyed record", () => {
    const tools: RawTool[] = [
      {
        name: "search",
        description: "Search for items",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "create",
        description: "Create an item",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
    ];

    const result = normalizeTools(tools);
    expect(Object.keys(result)).toEqual(["search", "create"]);
    expect(result.search.description).toBe("Search for items");
    expect(result.create.inputSchema).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
  });

  it("defaults description to empty string when missing", () => {
    const tools: RawTool[] = [{ name: "test", inputSchema: { type: "object" } }];
    const result = normalizeTools(tools);
    expect(result.test.description).toBe("");
  });

  it("includes outputSchema and annotations when present", () => {
    const tools: RawTool[] = [
      {
        name: "analyze",
        description: "Analyze data",
        inputSchema: { type: "object" },
        outputSchema: { type: "object", properties: { result: { type: "string" } } },
        annotations: { destructiveHint: false, readOnlyHint: true },
      },
    ];
    const result = normalizeTools(tools);
    expect(result.analyze.outputSchema).toEqual({
      type: "object",
      properties: { result: { type: "string" } },
    });
    expect(result.analyze.annotations).toEqual({ destructiveHint: false, readOnlyHint: true });
  });

  it("omits outputSchema and annotations when absent", () => {
    const tools: RawTool[] = [
      { name: "simple", description: "Simple tool", inputSchema: { type: "object" } },
    ];
    const result = normalizeTools(tools);
    expect(result.simple).not.toHaveProperty("outputSchema");
    expect(result.simple).not.toHaveProperty("annotations");
  });
});

describe("normalizeResources", () => {
  it("converts resources and templates into a keyed record", () => {
    const resources: RawResource[] = [
      {
        uri: "file:///data.json",
        name: "data",
        description: "Data file",
        mimeType: "application/json",
      },
    ];
    const templates: RawResourceTemplate[] = [
      { uriTemplate: "file:///users/{id}", name: "user", description: "User by ID" },
    ];

    const result = normalizeResources(resources, templates);
    expect(Object.keys(result)).toEqual(["file:///data.json", "file:///users/{id}"]);
    expect(result["file:///data.json"].isTemplate).toBe(false);
    expect(result["file:///data.json"].mimeType).toBe("application/json");
    expect(result["file:///users/{id}"].isTemplate).toBe(true);
    expect(result["file:///users/{id}"]).not.toHaveProperty("mimeType");
  });

  it("defaults description to empty string", () => {
    const resources: RawResource[] = [{ uri: "test://x", name: "x" }];
    const result = normalizeResources(resources, []);
    expect(result["test://x"].description).toBe("");
  });
});

describe("normalizePrompts", () => {
  it("converts prompts into a keyed record", () => {
    const prompts: RawPrompt[] = [
      {
        name: "summarize",
        description: "Summarize content",
        arguments: [
          { name: "text", description: "Text to summarize", required: true },
          { name: "maxLength", description: "Maximum length" },
        ],
      },
    ];

    const result = normalizePrompts(prompts);
    expect(Object.keys(result)).toEqual(["summarize"]);
    expect(result.summarize.arguments).toHaveLength(2);
    expect(result.summarize.arguments[0]).toEqual({
      name: "text",
      description: "Text to summarize",
      required: true,
    });
    expect(result.summarize.arguments[1]).toEqual({
      name: "maxLength",
      description: "Maximum length",
    });
  });

  it("handles prompts with no arguments", () => {
    const prompts: RawPrompt[] = [{ name: "greet", description: "Say hello" }];
    const result = normalizePrompts(prompts);
    expect(result.greet.arguments).toEqual([]);
  });

  it("defaults description to empty string", () => {
    const prompts: RawPrompt[] = [{ name: "test" }];
    const result = normalizePrompts(prompts);
    expect(result.test.description).toBe("");
  });
});

describe("createSnapshot", () => {
  it("creates a snapshot from minimal tool list", () => {
    const params: CreateSnapshotParams = {
      server: minimalServer,
      tools: [{ name: "ping", description: "Ping the server", inputSchema: { type: "object" } }],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      capture: minimalCapture,
    };

    const snapshot = createSnapshot(params);

    expect(snapshot.snapshotVersion).toBe("1.0.0");
    expect(snapshot.server).toEqual(minimalServer);
    expect(snapshot.capture).toEqual(minimalCapture);
    expect(Object.keys(snapshot.tools)).toEqual(["ping"]);
    expect(snapshot.tools.ping.description).toBe("Ping the server");
    expect(snapshot.resources).toEqual({});
    expect(snapshot.prompts).toEqual({});
  });

  it("creates a snapshot from tools, resources, and prompts", () => {
    const params: CreateSnapshotParams = {
      server: minimalServer,
      tools: [
        {
          name: "search",
          description: "Search",
          inputSchema: { type: "object", properties: { q: { type: "string" } } },
        },
      ],
      resources: [
        {
          uri: "data://items",
          name: "items",
          description: "All items",
          mimeType: "application/json",
        },
      ],
      resourceTemplates: [
        { uriTemplate: "data://items/{id}", name: "item", description: "Single item" },
      ],
      prompts: [
        {
          name: "explain",
          description: "Explain something",
          arguments: [{ name: "topic", required: true }],
        },
      ],
      capture: minimalCapture,
    };

    const snapshot = createSnapshot(params);

    expect(Object.keys(snapshot.tools)).toEqual(["search"]);
    expect(Object.keys(snapshot.resources)).toEqual(["data://items", "data://items/{id}"]);
    expect(snapshot.resources["data://items"].isTemplate).toBe(false);
    expect(snapshot.resources["data://items/{id}"].isTemplate).toBe(true);
    expect(Object.keys(snapshot.prompts)).toEqual(["explain"]);
    expect(snapshot.prompts.explain.arguments[0].required).toBe(true);
  });

  it("computes contentHash correctly", () => {
    const params: CreateSnapshotParams = {
      server: minimalServer,
      tools: [{ name: "test", description: "Test tool", inputSchema: { type: "object" } }],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      capture: minimalCapture,
    };

    const snapshot = createSnapshot(params);

    const expectedHash = computeContentHash(snapshot.tools, snapshot.resources, snapshot.prompts);
    expect(snapshot.contentHash).toBe(expectedHash);
    expect(snapshot.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("sets capturedAt to a valid ISO 8601 timestamp", () => {
    const before = new Date();
    const params: CreateSnapshotParams = {
      server: minimalServer,
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      capture: minimalCapture,
    };

    const snapshot = createSnapshot(params);
    const after = new Date();

    const capturedAt = new Date(snapshot.capturedAt);
    expect(capturedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(capturedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    // Verify ISO 8601 format
    expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("keys tools by name", () => {
    const params: CreateSnapshotParams = {
      server: minimalServer,
      tools: [
        { name: "alpha", description: "A", inputSchema: { type: "object" } },
        { name: "beta", description: "B", inputSchema: { type: "object" } },
        { name: "gamma", description: "C", inputSchema: { type: "object" } },
      ],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      capture: minimalCapture,
    };

    const snapshot = createSnapshot(params);
    expect(Object.keys(snapshot.tools)).toEqual(["alpha", "beta", "gamma"]);
    expect(snapshot.tools.alpha.description).toBe("A");
    expect(snapshot.tools.beta.description).toBe("B");
    expect(snapshot.tools.gamma.description).toBe("C");
  });
});
