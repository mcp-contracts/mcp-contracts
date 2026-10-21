import { describe, expect, it } from "vitest";
import { escapeMarkdown, markdownCode, markdownFence, sanitizeText } from "./sanitize.js";

describe("sanitizeText", () => {
  it("keeps ordinary text, newlines and tabs", () => {
    expect(sanitizeText("plain\ttext\nline two")).toBe("plain\ttext\nline two");
  });

  it("strips OSC sequences terminated by BEL or ST", () => {
    expect(sanitizeText("v1\u001b]0;Build OK\u0007 ok")).toBe("v1 ok");
    expect(sanitizeText("a\u001b]8;;https://evil\u001b\\link\u001b]8;;\u001b\\b")).toBe("alinkb");
  });

  it("strips CSI sequences such as clear screen and colours", () => {
    expect(sanitizeText("\u001b[2J\u001b[H\u001b[32mNo changes\u001b[0m")).toBe("No changes");
  });

  it("strips other escape sequences and lone escapes", () => {
    expect(sanitizeText("x\u001bcy\u001b")).toBe("xy");
  });

  it("strips C0, DEL and C1 control characters", () => {
    expect(sanitizeText("a\u0000b\u0007c\rd\u007fe\u009bf")).toBe("abcdef");
  });
});

describe("escapeMarkdown", () => {
  it("escapes characters that open HTML, code, links, images or tables", () => {
    expect(escapeMarkdown("<details>`z`[l](u)![i](u)|t|\\")).toBe(
      "\\<details\\>\\`z\\`\\[l\\](u)\\!\\[i\\](u)\\|t\\|\\\\",
    );
  });

  it("leaves emphasis markers and snake_case names readable", () => {
    expect(escapeMarkdown("create_contact *note*")).toBe("create_contact *note*");
  });

  it("collapses line breaks so text cannot start a new block", () => {
    expect(escapeMarkdown("a\n\n## heading\nb")).toBe("a ## heading b");
  });

  it("removes control sequences first", () => {
    expect(escapeMarkdown("ok\u001b[2J")).toBe("ok");
  });
});

describe("markdownCode", () => {
  it("wraps plain text in single backticks", () => {
    expect(markdownCode("1.0.0")).toBe("`1.0.0`");
  });

  it("uses a longer delimiter than any backtick run in the content", () => {
    expect(markdownCode("a``b")).toBe("```a``b```");
  });

  it("pads content that starts or ends with a backtick", () => {
    expect(markdownCode("`x")).toBe("`` `x ``");
  });

  it("handles the empty string", () => {
    expect(markdownCode("")).toBe("` `");
  });
});

describe("markdownFence", () => {
  it("uses three backticks for ordinary content", () => {
    expect(markdownFence("- a\n+ b")).toBe("```");
  });

  it("outgrows any backtick run in the content", () => {
    expect(markdownFence("x\n```\n<!--")).toBe("````");
    expect(markdownFence("`````")).toBe("``````");
  });
});
