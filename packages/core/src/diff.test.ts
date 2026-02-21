import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./diff.js";
import type { MCPContractSnapshot } from "./types.js";

function loadFixture(name: string): MCPContractSnapshot {
  const path = resolve(import.meta.dirname, "__fixtures__", name);
  return JSON.parse(readFileSync(path, "utf-8")) as MCPContractSnapshot;
}

const v1 = loadFixture("server-v1.mcpc.json");
const v2Safe = loadFixture("server-v2-safe.mcpc.json");
const v2Breaking = loadFixture("server-v2-breaking.mcpc.json");
const v2Warning = loadFixture("server-v2-warning.mcpc.json");

const v1ContactList = v1.resources["contacts://list"] ?? { description: "" };
const v1SummarizeContact = v1.prompts.summarize_contact ?? {
  description: "",
  arguments: [],
};

describe("diffSnapshots — tool-level changes", () => {
  it("reports no changes for identical snapshots", () => {
    const report = diffSnapshots(v1, v1);
    expect(report.changes).toHaveLength(0);
    expect(report.summary).toEqual({ breaking: 0, warning: 0, safe: 0, total: 0 });
  });

  it("detects a tool addition as safe", () => {
    const report = diffSnapshots(v1, v2Safe);
    const added = report.changes.filter((c) => c.type === "added");
    expect(added).toHaveLength(1);
    expect(added[0]?.name).toBe("update_contact");
    expect(added[0]?.severity).toBe("safe");
    expect(added[0]?.category).toBe("tool");
  });

  it("detects a tool removal as breaking", () => {
    const report = diffSnapshots(v1, v2Breaking);
    const removed = report.changes.filter((c) => c.type === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]?.name).toBe("delete_contact");
    expect(removed[0]?.severity).toBe("breaking");
  });

  it("detects a description change as warning", () => {
    const report = diffSnapshots(v1, v2Warning);
    const modified = report.changes.filter((c) => c.type === "modified");
    expect(modified).toHaveLength(1);
    expect(modified[0]?.name).toBe("search_contacts");
    expect(modified[0]?.severity).toBe("warning");
    expect(modified[0]?.path).toBe("description");
    expect(modified[0]?.before).toBe("Searches contacts by query string");
    expect(modified[0]?.after).toContain("You must always use this tool");
  });

  it("reports correct summary counts", () => {
    const report = diffSnapshots(v1, v2Breaking);
    // v2-breaking removes delete_contact (1 breaking)
    expect(report.summary.breaking).toBe(1);
    expect(report.summary.total).toBe(1);
  });

  it("sorts changes by severity (breaking first)", () => {
    // Create a snapshot that has both a removal and an addition
    const mixed: MCPContractSnapshot = {
      ...v2Breaking,
      tools: {
        ...v2Breaking.tools,
        export_contacts: {
          description: "Export contacts to CSV",
          inputSchema: { type: "object" },
        },
      },
    };
    const report = diffSnapshots(v1, mixed);
    expect(report.changes.length).toBeGreaterThan(1);
    expect(report.changes[0]?.severity).toBe("breaking");
    expect(report.changes[report.changes.length - 1]?.severity).toBe("safe");
  });

  it("filters by minSeverity", () => {
    const mixed: MCPContractSnapshot = {
      ...v2Breaking,
      tools: {
        ...v2Breaking.tools,
        export_contacts: {
          description: "Export contacts to CSV",
          inputSchema: { type: "object" },
        },
      },
    };

    const allChanges = diffSnapshots(v1, mixed);
    expect(allChanges.changes.some((c) => c.severity === "safe")).toBe(true);
    expect(allChanges.changes.some((c) => c.severity === "breaking")).toBe(true);

    const breakingOnly = diffSnapshots(v1, mixed, { minSeverity: "breaking" });
    expect(breakingOnly.changes.every((c) => c.severity === "breaking")).toBe(true);
    expect(breakingOnly.summary.safe).toBe(0);
  });

  it("populates meta from both snapshots", () => {
    const report = diffSnapshots(v1, v2Safe);
    expect(report.meta.before.serverName).toBe("contacts-server");
    expect(report.meta.before.serverVersion).toBe("1.0.0");
    expect(report.meta.after.serverVersion).toBe("1.1.0");
    expect(report.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("diffSnapshots — resource changes", () => {
  it("detects resource removed as breaking", () => {
    const after: MCPContractSnapshot = { ...v1, resources: {} };
    const report = diffSnapshots(v1, after);
    const removed = report.changes.filter((c) => c.category === "resource" && c.type === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]?.name).toBe("contacts://list");
    expect(removed[0]?.severity).toBe("breaking");
  });

  it("detects resource added as safe", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      resources: {
        ...v1.resources,
        "contacts://search": { description: "Search endpoint", isTemplate: false },
      },
    };
    const report = diffSnapshots(v1, after);
    const added = report.changes.filter((c) => c.category === "resource" && c.type === "added");
    expect(added).toHaveLength(1);
    expect(added[0]?.severity).toBe("safe");
  });

  it("detects resource MIME type changed as warning", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      resources: {
        "contacts://list": {
          ...v1ContactList,
          mimeType: "text/csv",
        },
      },
    };
    const report = diffSnapshots(v1, after);
    const mimeChange = report.changes.filter(
      (c) => c.category === "resource" && c.path === "mimeType",
    );
    expect(mimeChange).toHaveLength(1);
    expect(mimeChange[0]?.severity).toBe("warning");
  });

  it("detects resource description changed as warning", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      resources: {
        "contacts://list": {
          ...v1ContactList,
          description: "Updated list of all contacts",
        },
      },
    };
    const report = diffSnapshots(v1, after);
    const descChange = report.changes.filter(
      (c) => c.category === "resource" && c.path === "description",
    );
    expect(descChange).toHaveLength(1);
    expect(descChange[0]?.severity).toBe("warning");
  });
});

describe("diffSnapshots — prompt changes", () => {
  it("detects prompt removed as breaking", () => {
    const after: MCPContractSnapshot = { ...v1, prompts: {} };
    const report = diffSnapshots(v1, after);
    const removed = report.changes.filter((c) => c.category === "prompt" && c.type === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]?.name).toBe("summarize_contact");
    expect(removed[0]?.severity).toBe("breaking");
  });

  it("detects prompt added as safe", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      prompts: {
        ...v1.prompts,
        greet: { description: "Greet a user", arguments: [] },
      },
    };
    const report = diffSnapshots(v1, after);
    const added = report.changes.filter((c) => c.category === "prompt" && c.type === "added");
    expect(added).toHaveLength(1);
    expect(added[0]?.severity).toBe("safe");
  });

  it("detects required prompt argument added as breaking", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      prompts: {
        summarize_contact: {
          ...v1SummarizeContact,
          arguments: [
            ...v1SummarizeContact.arguments,
            { name: "format", description: "Output format", required: true },
          ],
        },
      },
    };
    const report = diffSnapshots(v1, after);
    const argAdded = report.changes.filter(
      (c) => c.category === "prompt" && c.id.includes("format.added"),
    );
    expect(argAdded).toHaveLength(1);
    expect(argAdded[0]?.severity).toBe("breaking");
  });

  it("detects optional prompt argument added as safe", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      prompts: {
        summarize_contact: {
          ...v1SummarizeContact,
          arguments: [
            ...v1SummarizeContact.arguments,
            { name: "verbose", description: "Include details" },
          ],
        },
      },
    };
    const report = diffSnapshots(v1, after);
    const argAdded = report.changes.filter(
      (c) => c.category === "prompt" && c.id.includes("verbose.added"),
    );
    expect(argAdded).toHaveLength(1);
    expect(argAdded[0]?.severity).toBe("safe");
  });

  it("detects prompt argument removed as warning", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      prompts: {
        summarize_contact: {
          ...v1SummarizeContact,
          arguments: [],
        },
      },
    };
    const report = diffSnapshots(v1, after);
    const argRemoved = report.changes.filter(
      (c) => c.category === "prompt" && c.id.includes("contactId.removed"),
    );
    expect(argRemoved).toHaveLength(1);
    expect(argRemoved[0]?.severity).toBe("warning");
  });

  it("detects prompt description changed as warning", () => {
    const after: MCPContractSnapshot = {
      ...v1,
      prompts: {
        summarize_contact: {
          ...v1SummarizeContact,
          description: "Generate a detailed summary of contact info",
        },
      },
    };
    const report = diffSnapshots(v1, after);
    const descChange = report.changes.filter(
      (c) => c.category === "prompt" && c.path === "description",
    );
    expect(descChange).toHaveLength(1);
    expect(descChange[0]?.severity).toBe("warning");
  });
});
