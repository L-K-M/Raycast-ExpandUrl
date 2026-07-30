import { describe, expect, it } from "vitest";
import {
  chainToMarkdown,
  chainToText,
  countTrackingParams,
  describeChainStatus,
  describeStatus,
  describeVia,
  finalHop,
} from "../src/lib/format";
import type { Chain, Hop } from "../src/lib/types";

function hop(overrides: Partial<Hop> & Pick<Hop, "index" | "url">): Hop {
  return { via: "http", ...overrides };
}

const chain: Chain = {
  source: "https://bit.ly/x",
  status: "final",
  hops: [
    hop({ index: 0, url: "https://bit.ly/x", via: "start", status: 301, statusText: "Moved Permanently" }),
    hop({ index: 1, url: "https://t.co/y", status: 301, statusText: "Moved Permanently" }),
    hop({
      index: 2,
      url: "https://example.com/a?utm_source=x",
      status: 200,
      statusText: "OK",
      documentTitle: "An Article",
      trackingParams: ["utm_source"],
    }),
  ],
};

describe("describeVia", () => {
  it("labels the first hop as the start", () => {
    expect(describeVia(chain.hops[0] as Hop)).toBe("Start");
  });

  it("labels an HTTP redirect", () => {
    expect(describeVia(chain.hops[1] as Hop)).toBe("Redirect");
  });

  it("labels a meta refresh", () => {
    expect(describeVia(hop({ index: 1, url: "https://x/", via: "meta-refresh" }))).toBe("Meta refresh");
  });
});

describe("describeStatus", () => {
  it("includes the status text when there is one", () => {
    expect(describeStatus(chain.hops[2] as Hop)).toBe("200 OK");
  });

  it("falls back to the bare code", () => {
    expect(describeStatus(hop({ index: 0, url: "https://x/", status: 418 }))).toBe("418");
  });

  it("reports a hop that has not been requested", () => {
    expect(describeStatus(hop({ index: 1, url: "https://x/" }))).toBe("Not requested");
  });

  it("prefers the error over the status", () => {
    expect(describeStatus(hop({ index: 0, url: "https://x/", status: 302, error: "timed out" }))).toBe("timed out");
  });
});

describe("describeChainStatus", () => {
  it("summarises a resolved chain", () => {
    expect(describeChainStatus(chain)).toBe("3 hops, resolved");
  });

  it("uses the singular for one hop and says there were no redirects", () => {
    expect(describeChainStatus({ ...chain, hops: [chain.hops[0] as Hop] })).toBe("No redirects");
  });

  it.each([
    ["paused", "3 hops, more to expand"],
    ["loop", "3 hops, redirect loop"],
    ["max-hops", "3 hops, stopped at the hop limit"],
    ["stopped", "3 hops, stopped"],
    ["error", "3 hops, failed"],
    ["idle", "Not started"],
  ] as const)("summarises the %s status", (status, expected) => {
    expect(describeChainStatus({ ...chain, status })).toBe(expected);
  });
});

describe("finalHop", () => {
  it("returns the last successfully requested hop", () => {
    expect(finalHop(chain)?.url).toBe("https://example.com/a?utm_source=x");
  });

  it("skips a trailing hop that was never requested", () => {
    const paused: Chain = {
      ...chain,
      status: "paused",
      hops: [...chain.hops, hop({ index: 3, url: "https://example.com/next" })],
    };
    expect(finalHop(paused)?.url).toBe("https://example.com/a?utm_source=x");
  });

  it("skips a trailing hop that failed", () => {
    const failed: Chain = {
      ...chain,
      status: "error",
      hops: [...chain.hops, hop({ index: 3, url: "https://example.com/next", error: "timed out" })],
    };
    expect(finalHop(failed)?.url).toBe("https://example.com/a?utm_source=x");
  });
});

describe("countTrackingParams", () => {
  it("totals trackers across the chain", () => {
    expect(countTrackingParams(chain)).toBe(1);
  });

  it("returns zero for a clean chain", () => {
    expect(countTrackingParams({ ...chain, hops: [chain.hops[0] as Hop] })).toBe(0);
  });
});

describe("chainToText", () => {
  it("numbers hops from one and annotates each status", () => {
    const text = chainToText(chain);
    expect(text).toContain("1. https://bit.ly/x [301 Moved Permanently]");
    expect(text).toContain("3. https://example.com/a?utm_source=x [200 OK]");
    expect(text.trimEnd().endsWith("3 hops, resolved")).toBe(true);
  });

  it("omits the status bracket for an unrequested hop", () => {
    const text = chainToText({ ...chain, hops: [hop({ index: 0, url: "https://x/", via: "start" })] });
    expect(text).toContain("1. https://x/");
    expect(text).not.toContain("[");
  });
});

describe("chainToMarkdown", () => {
  it("renders every hop with how it was reached", () => {
    const markdown = chainToMarkdown(chain);
    expect(markdown).toContain("**Redirect chain for** <https://bit.ly/x>");
    expect(markdown).toContain("1. <https://bit.ly/x> — Start · 301 Moved Permanently");
    expect(markdown).toContain("2. <https://t.co/y> — Redirect · 301 Moved Permanently");
  });

  it("includes the destination title when one was read", () => {
    expect(chainToMarkdown(chain)).toContain("**Destination title:** An Article");
  });

  it("omits the title line when there is none", () => {
    const untitled: Chain = { ...chain, hops: chain.hops.map((h) => ({ ...h, documentTitle: undefined })) };
    expect(chainToMarkdown(untitled)).not.toContain("Destination title");
  });

  it("wraps URLs in angle brackets so trackers do not break the link", () => {
    // Bare Markdown autolinks mangle URLs containing underscores or parens.
    expect(chainToMarkdown(chain)).toContain("<https://example.com/a?utm_source=x>");
  });
});
