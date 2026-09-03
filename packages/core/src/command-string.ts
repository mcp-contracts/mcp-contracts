/**
 * Shell-style splitting of command strings.
 *
 * Lets CLI users pass `--command "node server.js"` as a single string
 * instead of having to separate the executable from its arguments.
 */

/**
 * Reads a quoted segment starting just after the opening quote.
 *
 * Inside double quotes a backslash escapes the next character; inside
 * single quotes every character is literal.
 *
 * @param input - The full command string.
 * @param start - Index of the first character after the opening quote.
 * @param quote - The quote character that opened the segment.
 * @returns The segment content and the index of the closing quote.
 */
function readQuotedSegment(
  input: string,
  start: number,
  quote: '"' | "'",
): { content: string; end: number } {
  let content = "";
  for (let i = start; i < input.length; i++) {
    const char = input[i] as string;
    if (char === quote) {
      return { content, end: i };
    }
    if (quote === '"' && char === "\\" && i + 1 < input.length) {
      content += input[i + 1];
      i++;
      continue;
    }
    content += char;
  }
  throw new Error(`Invalid command "${input}": unterminated ${quote} quote`);
}

/**
 * Splits a command string into an executable and its arguments.
 *
 * Tokens are separated by unquoted whitespace. Single-quoted and
 * double-quoted segments are kept as one token with the quotes removed,
 * so executables or arguments containing spaces can be expressed as
 * `'"/path with spaces/node" server.js'`. A backslash escapes the next
 * character outside single quotes. No variable expansion, globbing, or
 * other shell behavior is performed.
 *
 * @param input - The command string, e.g. `node server.js`.
 * @returns The tokens in order; the first is the executable.
 */
export function splitCommandString(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i] as string;

    if (char === '"' || char === "'") {
      const segment = readQuotedSegment(input, i + 1, char);
      current += segment.content;
      hasToken = true;
      i = segment.end;
      continue;
    }

    if (char === "\\") {
      if (i + 1 >= input.length) {
        throw new Error(`Invalid command "${input}": trailing backslash`);
      }
      current += input[i + 1];
      i++;
      continue;
    }

    if (/\s/.test(char)) {
      if (hasToken || current.length > 0) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }

    current += char;
  }

  if (hasToken || current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Resolves a command string and optional extra arguments into a
 * `{ command, args }` pair for spawning a stdio MCP server.
 *
 * The command string is split with {@link splitCommandString}; any tokens
 * after the executable are prepended to `extraArgs`.
 *
 * @param commandString - The command string, e.g. `node server.js`.
 * @param extraArgs - Arguments passed separately (e.g. via `--args`).
 * @returns The executable and the combined argument list.
 */
export function resolveCommandString(
  commandString: string,
  extraArgs?: string[],
): { command: string; args?: string[] } {
  const tokens = splitCommandString(commandString);
  const command = tokens[0];
  if (command === undefined || command.length === 0) {
    throw new Error(`Invalid command "${commandString}": no executable`);
  }
  const args = [...tokens.slice(1), ...(extraArgs ?? [])];
  return args.length > 0 ? { command, args } : { command };
}
