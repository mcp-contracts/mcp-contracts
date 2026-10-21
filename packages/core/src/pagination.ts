/** One page of a paginated MCP list result. */
export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
}

/** Bounds applied while following `nextCursor` across pages. */
export interface PaginationLimits {
  /** Maximum number of pages to request for one list. */
  maxPages: number;
  /** Maximum number of items to accept across all pages of one list. */
  maxItems: number;
  /** Absolute time (ms since epoch) after which no further page is requested. */
  deadline?: number;
}

/** Default bounds for discovery. Generous for real servers, fatal for endless ones. */
export const DEFAULT_PAGINATION_LIMITS: PaginationLimits = {
  maxPages: 1000,
  maxItems: 10_000,
};

/**
 * Follows `nextCursor` until the server stops returning one, within bounds.
 *
 * Discovery must terminate regardless of what the server sends, so the
 * collector refuses to continue past the page or item limit, when a cursor
 * repeats, or once the deadline has passed. Each of those is a discovery
 * failure (thrown), never a silently truncated result.
 *
 * @param label - What is being listed, for error messages (e.g. "tools").
 * @param fetchPage - Requests one page; receives the cursor from the previous page.
 * @param limits - Bounds to enforce. Defaults to {@link DEFAULT_PAGINATION_LIMITS}.
 * @returns Every item from every page, in order.
 * @throws Error when a bound is exceeded or a cursor repeats.
 */
export async function collectPages<T>(
  label: string,
  fetchPage: (cursor: string | undefined) => Promise<PageResult<T>>,
  limits: PaginationLimits = DEFAULT_PAGINATION_LIMITS,
): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;

  do {
    if (limits.deadline !== undefined && Date.now() > limits.deadline) {
      throw new Error(`Listing ${label} exceeded the capture deadline`);
    }
    if (pages >= limits.maxPages) {
      throw new Error(`Listing ${label} exceeded ${limits.maxPages} pages`);
    }

    const page = await fetchPage(cursor);
    pages += 1;

    if (items.length + page.items.length > limits.maxItems) {
      throw new Error(`Listing ${label} exceeded ${limits.maxItems} items`);
    }
    items.push(...page.items);

    cursor = page.nextCursor;
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) {
        throw new Error(`Listing ${label} returned a repeated cursor; refusing to loop`);
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== undefined);

  return items;
}
