import { describe, expect, it } from "vitest";
import { findTrackingParams, isTrackingParam, stripTrackingParams } from "../src/lib/tracking";

describe("isTrackingParam", () => {
  it.each(["utm_source", "utm_medium", "utm_campaign", "UTM_SOURCE", "fbclid", "gclid", "msclkid", "mc_eid", "igshid"])(
    "treats %s as an unambiguous tracker",
    (name) => {
      expect(isTrackingParam(name)).toBe(true);
    },
  );

  it.each(["id", "page", "q", "query", "lang", "v", "t"])("leaves ordinary parameter %s alone", (name) => {
    expect(isTrackingParam(name)).toBe(false);
  });

  it.each(["ref", "s", "si", "source", "trk"])("only treats %s as a tracker in aggressive mode", (name) => {
    // These carry real meaning on some sites, so stripping them by default
    // would hand users broken URLs.
    expect(isTrackingParam(name)).toBe(false);
    expect(isTrackingParam(name, { aggressive: true })).toBe(true);
  });
});

describe("findTrackingParams", () => {
  it("lists trackers in the order they appear", () => {
    const url = new URL("https://example.com/?a=1&utm_source=x&b=2&fbclid=y");
    expect(findTrackingParams(url)).toEqual(["utm_source", "fbclid"]);
  });

  it("returns an empty list when there are none", () => {
    expect(findTrackingParams(new URL("https://example.com/?a=1"))).toEqual([]);
  });

  it("does not report a repeated parameter twice", () => {
    const url = new URL("https://example.com/?utm_source=a&utm_source=b");
    expect(findTrackingParams(url)).toEqual(["utm_source"]);
  });
});

describe("stripTrackingParams", () => {
  it("removes trackers and keeps everything else in order", () => {
    const result = stripTrackingParams("https://example.com/p?a=1&utm_source=x&b=2&gclid=z&c=3");
    expect(result.url).toBe("https://example.com/p?a=1&b=2&c=3");
    expect(result.removed).toEqual(["utm_source", "gclid"]);
  });

  it("drops the trailing ? when the query becomes empty", () => {
    const result = stripTrackingParams("https://example.com/p?utm_source=x");
    expect(result.url).toBe("https://example.com/p");
    expect(result.removed).toEqual(["utm_source"]);
  });

  it("returns the input untouched when there is nothing to strip", () => {
    // Round-tripping through URL would re-encode things like %7E, so a URL
    // with no trackers must come back byte-identical.
    const input = "https://example.com/p?a=%7Eb&c=d";
    const result = stripTrackingParams(input);
    expect(result.url).toBe(input);
    expect(result.removed).toEqual([]);
  });

  it("preserves the fragment", () => {
    const result = stripTrackingParams("https://example.com/p?utm_source=x&a=1#section");
    expect(result.url).toBe("https://example.com/p?a=1#section");
  });

  it("removes every occurrence of a repeated tracker", () => {
    const result = stripTrackingParams("https://example.com/p?utm_source=a&utm_source=b&keep=1");
    expect(result.url).toBe("https://example.com/p?keep=1");
  });

  it("strips the contextual tier only when asked", () => {
    const input = "https://example.com/p?ref=twitter&a=1";
    expect(stripTrackingParams(input).url).toBe(input);
    expect(stripTrackingParams(input, { aggressive: true }).url).toBe("https://example.com/p?a=1");
  });

  it("accepts a URL object as well as a string", () => {
    const result = stripTrackingParams(new URL("https://example.com/p?utm_source=x&a=1"));
    expect(result.url).toBe("https://example.com/p?a=1");
  });

  it("returns unparseable input unchanged instead of throwing", () => {
    expect(stripTrackingParams("not a url").url).toBe("not a url");
  });
});
