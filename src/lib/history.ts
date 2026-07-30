/**
 * Recently expanded URLs.
 *
 * Pure list manipulation, kept separate from storage so the ordering and
 * de-duplication rules can be tested without a Raycast runtime.
 */

export interface HistoryEntry {
  /** The URL that was expanded. */
  url: string;
  /** Where it ended up, when the chain resolved. */
  finalUrl?: string;
  /** Number of hops in the chain, including the source. */
  hops: number;
  /** Epoch milliseconds. Supplied by the caller so this stays deterministic. */
  at: number;
}

export const HISTORY_LIMIT = 15;

/**
 * Adds an entry, newest first, with at most one row per source URL.
 *
 * Re-expanding a URL should move it to the top and replace what we knew about
 * it, not add a second row saying something slightly different.
 */
export function addEntry(entries: readonly HistoryEntry[], entry: HistoryEntry, limit = HISTORY_LIMIT): HistoryEntry[] {
  const withoutDuplicate = entries.filter((existing) => existing.url !== entry.url);
  return [entry, ...withoutDuplicate].slice(0, Math.max(0, limit));
}

export function removeEntry(entries: readonly HistoryEntry[], url: string): HistoryEntry[] {
  return entries.filter((entry) => entry.url !== url);
}

/**
 * Parses stored JSON, discarding anything that is not a well-formed entry.
 *
 * Storage outlives the code that wrote it, so a shape change must degrade to
 * "no history" rather than to a crash on launch.
 */
export function parseHistory(raw: string | undefined): HistoryEntry[] {
  if (raw === undefined || raw.length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isHistoryEntry);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.url === "string" &&
    entry.url.length > 0 &&
    typeof entry.hops === "number" &&
    typeof entry.at === "number" &&
    (entry.finalUrl === undefined || typeof entry.finalUrl === "string")
  );
}

export function serializeHistory(entries: readonly HistoryEntry[]): string {
  return JSON.stringify(entries);
}
