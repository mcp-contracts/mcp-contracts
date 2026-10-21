import { describe, expect, it, vi } from "vitest";
import { collectPages, DEFAULT_PAGINATION_LIMITS } from "./pagination.js";

describe("collectPages", () => {
  it("follows cursors until the server stops returning one", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ["a"], nextCursor: "p2" })
      .mockResolvedValueOnce({ items: ["b", "c"], nextCursor: "p3" })
      .mockResolvedValueOnce({ items: ["d"] });
    await expect(collectPages("tools", fetchPage)).resolves.toEqual(["a", "b", "c", "d"]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "p2");
    expect(fetchPage).toHaveBeenNthCalledWith(3, "p3");
  });

  it("returns an empty list for an empty single page", async () => {
    await expect(collectPages("prompts", async () => ({ items: [] }))).resolves.toEqual([]);
  });

  it("rejects a cursor that repeats", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [], nextCursor: "same" });
    await expect(collectPages("tools", fetchPage)).rejects.toThrow("repeated cursor");
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("rejects when the page limit is exceeded", async () => {
    let n = 0;
    const fetchPage = async () => ({ items: [], nextCursor: `c${n++}` });
    await expect(collectPages("tools", fetchPage, { maxPages: 3, maxItems: 100 })).rejects.toThrow(
      "exceeded 3 pages",
    );
  });

  it("rejects when the item limit is exceeded", async () => {
    let n = 0;
    const fetchPage = async () => ({ items: [1, 2, 3], nextCursor: `c${n++}` });
    await expect(collectPages("tools", fetchPage, { maxPages: 100, maxItems: 5 })).rejects.toThrow(
      "exceeded 5 items",
    );
  });

  it("rejects once the deadline has passed", async () => {
    const fetchPage = async () => ({ items: [1], nextCursor: "next" });
    const limits = { ...DEFAULT_PAGINATION_LIMITS, deadline: Date.now() - 1 };
    await expect(collectPages("tools", fetchPage, limits)).rejects.toThrow("capture deadline");
  });

  it("propagates errors from the page fetch", async () => {
    const fetchPage = async () => {
      throw new Error("MCP error -32603: boom");
    };
    await expect(collectPages("tools", fetchPage)).rejects.toThrow("MCP error -32603: boom");
  });
});
