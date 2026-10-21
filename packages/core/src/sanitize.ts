/**
 * Sanitizers for strings that originate from an MCP server.
 *
 * Tool names, descriptions, server info and error messages are attacker
 * controlled. Before any of them reach a terminal, a markdown file or a PR
 * comment they pass through here, so a server cannot forge output, hide
 * findings or drive the viewer's terminal.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-sequence matching
const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-sequence matching
const CSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-sequence matching
const OTHER_ESCAPE = /\x1b.?/g;
// C0 and C1 controls plus DEL, keeping only newline and tab.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-character matching
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

// Characters that can open HTML, code, links, images or table cells. Emphasis
// markers are left alone: they cannot hide content and snake_case names are common.
const MARKDOWN_SPECIAL = /[\\`[\]<>|!]/g;

/**
 * Removes terminal escape sequences and control characters.
 *
 * Strips OSC (title, hyperlink, clipboard), CSI (cursor, clear, colour),
 * any other ESC-introduced sequence, and all C0/C1 control characters
 * except newline and tab. Applied regardless of colour settings.
 *
 * @param input - Untrusted text.
 * @returns The text with nothing left that a terminal would interpret.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(OSC_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .replace(OTHER_ESCAPE, "")
    .replace(CONTROL_CHARS, "");
}

/**
 * Makes untrusted text safe to place inline in markdown prose.
 *
 * Control sequences are removed, line breaks collapse to spaces so the text
 * cannot start a new block, and the metacharacters that open HTML, code,
 * links, images or table cells are backslash-escaped. Emphasis markers are
 * deliberately not escaped: they cannot hide content, and escaping them
 * would mangle every snake_case name.
 *
 * @param input - Untrusted text.
 * @returns Escaped text that renders literally.
 */
export function escapeMarkdown(input: string): string {
  return sanitizeText(input)
    .replace(/[\n\t]+/g, " ")
    .replace(MARKDOWN_SPECIAL, "\\$&");
}

/**
 * Longest run of consecutive backticks in a string.
 *
 * @param input - Any text.
 * @returns Length of the longest backtick run, 0 when there is none.
 */
function longestBacktickRun(input: string): number {
  let longest = 0;
  for (const match of input.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}

/**
 * Wraps untrusted text in an inline code span that it cannot escape.
 *
 * The delimiter is one backtick longer than any run inside the text, and
 * the content is padded when it starts or ends with a backtick, per
 * CommonMark.
 *
 * @param input - Untrusted text.
 * @returns A markdown code span.
 */
export function markdownCode(input: string): string {
  const text = sanitizeText(input).replace(/[\n\t]+/g, " ");
  if (text === "") {
    return "` `";
  }
  const delimiter = "`".repeat(longestBacktickRun(text) + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${delimiter}${pad}${text}${pad}${delimiter}`;
}

/**
 * Chooses a fence that untrusted content cannot close.
 *
 * @param content - The content that will go inside the fence.
 * @returns A string of backticks, at least three, longer than any run in the content.
 */
export function markdownFence(content: string): string {
  return "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
}
