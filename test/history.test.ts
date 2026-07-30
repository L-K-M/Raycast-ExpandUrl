import { describe, expect, it } from "vitest";
import {
  addEntry,
  HISTORY_LIMIT,
  parseHistory,
  removeEntry,
  serializeHistory,
  type HistoryEntry,
} from "../src/lib/history";

const entry = (url: string, at = 1): HistoryEntry => ({ url, hops: 2, at });

describe("addEntry", () => {
  it("puts the newest entry first", () => {
    const result = addEntry([entry("https://a/")], entry("https://b/", 2));
    expect(result.map((e) => e.url)).toEqual(["https://b/", "https://a/"]);
  });

  it("moves a re-expanded URL to the top instead of duplicating it", () => {
    const existing = [entry("https://a/"), entry("https://b/")];
    const result = addEntry(existing, entry("https://a/", 9));
    expect(result.map((e) => e.url)).toEqual(["https://a/", "https://b/"]);
    expect(result).toHaveLength(2);
  });

  it("replaces what was known about a re-expanded URL", () => {
    const existing = [{ ...entry("https://a/"), hops: 2, finalUrl: "https://old/" }];
    const result = addEntry(existing, { url: "https://a/", hops: 5, finalUrl: "https://new/", at: 9 });
    expect(result[0]?.hops).toBe(5);
    expect(result[0]?.finalUrl).toBe("https://new/");
  });

  it("caps the list at the limit, dropping the oldest", () => {
    let entries: HistoryEntry[] = [];
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      entries = addEntry(entries, entry(`https://example.com/${index}`, index));
    }
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0]?.url).toBe(`https://example.com/${HISTORY_LIMIT + 4}`);
  });

  it("honours a custom limit", () => {
    const result = addEntry([entry("https://a/"), entry("https://b/")], entry("https://c/"), 2);
    expect(result.map((e) => e.url)).toEqual(["https://c/", "https://a/"]);
  });
});

describe("removeEntry", () => {
  it("removes only the named URL", () => {
    const result = removeEntry([entry("https://a/"), entry("https://b/")], "https://a/");
    expect(result.map((e) => e.url)).toEqual(["https://b/"]);
  });

  it("is a no-op for a URL that is not there", () => {
    const entries = [entry("https://a/")];
    expect(removeEntry(entries, "https://zzz/")).toEqual(entries);
  });
});

describe("parseHistory", () => {
  it("round-trips through serialize", () => {
    const entries = [{ url: "https://a/", hops: 3, at: 5, finalUrl: "https://b/" }];
    expect(parseHistory(serializeHistory(entries))).toEqual(entries);
  });

  it("returns nothing for missing or empty storage", () => {
    expect(parseHistory(undefined)).toEqual([]);
    expect(parseHistory("")).toEqual([]);
  });

  /**
   * Stored data outlives the code that wrote it, so every one of these must
   * degrade to "no history" rather than throwing on launch.
   */
  it.each([
    ["invalid JSON", "{not json"],
    ["a JSON object", '{"url":"https://a/"}'],
    ["a JSON string", '"nope"'],
    ["null", "null"],
  ])("discards %s", (_label, raw) => {
    expect(parseHistory(raw)).toEqual([]);
  });

  it("drops malformed entries but keeps well-formed ones", () => {
    const raw = JSON.stringify([
      { url: "https://good/", hops: 1, at: 1 },
      { url: "", hops: 1, at: 1 },
      { hops: 1, at: 1 },
      { url: "https://nohops/", at: 1 },
      { url: "https://badfinal/", hops: 1, at: 1, finalUrl: 42 },
      null,
      "string",
    ]);
    expect(parseHistory(raw).map((e) => e.url)).toEqual(["https://good/"]);
  });
});
