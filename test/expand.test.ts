import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expandChain, expandFully, resolveHop } from "../src/lib/expand";
import { DEFAULT_EXPAND_OPTIONS, type Chain, type ExpandOptions } from "../src/lib/types";
import { startTestServer, type TestServer } from "./helpers/server";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

/**
 * The test server is on 127.0.0.1, which the address guard blocks by design.
 * Integration tests therefore run with blocking off; that the blocking itself
 * works is covered by guards.test.ts and by the dedicated section at the bottom
 * of this file.
 */
function options(overrides: Partial<ExpandOptions> = {}): ExpandOptions {
  return {
    ...DEFAULT_EXPAND_OPTIONS,
    blockPrivateHosts: false,
    timeoutMs: 5_000,
    ...overrides,
  };
}

function urls(chain: Chain): string[] {
  return chain.hops.map((hop) => hop.url);
}

describe("resolveHop", () => {
  it("reports a redirect target without following it", async () => {
    const result = await resolveHop(new URL(server.url("/redirect/3")), options());
    expect(result.status).toBe(302);
    expect(result.next?.url.href).toBe(server.url("/redirect/2"));
    expect(result.next?.via).toBe("http");
  });

  it("uses HEAD for redirects, so no body is fetched", async () => {
    const before = server.requests.length;
    await resolveHop(new URL(server.url("/redirect/1")), options());
    expect(server.requests.slice(before)).toEqual(["HEAD /redirect/1"]);
  });

  it("resolves a relative Location against the current URL", async () => {
    const result = await resolveHop(new URL(server.url("/redirect/1")), options());
    expect(result.next?.url.href).toBe(server.url("/end"));
  });

  it("resolves a ../ Location", async () => {
    const result = await resolveHop(new URL(server.url("/relative-dotdot")), options());
    expect(result.next?.url.href).toBe(server.url("/end"));
  });

  it("resolves a protocol-relative Location", async () => {
    const result = await resolveHop(new URL(server.url("/protocol-relative")), options());
    expect(result.next?.url.href).toBe(server.url("/end"));
  });

  it("resolves an absolute Location", async () => {
    const result = await resolveHop(new URL(server.url("/absolute")), options());
    expect(result.next?.url.href).toBe(server.url("/end"));
  });

  it("treats a 3xx without a Location as an error, keeping the status", async () => {
    const result = await resolveHop(new URL(server.url("/no-location")), options());
    expect(result.status).toBe(302);
    expect(result.error).toMatch(/without a Location/i);
    expect(result.next).toBeUndefined();
  });

  it("treats an unparseable Location as an error", async () => {
    const result = await resolveHop(new URL(server.url("/bad-location")), options());
    expect(result.error).toMatch(/unparseable Location/i);
  });

  it("falls back to GET when the server refuses HEAD", async () => {
    const before = server.requests.length;
    const result = await resolveHop(new URL(server.url("/head-405")), options());
    expect(server.requests.slice(before)).toEqual(["HEAD /head-405", "GET /head-405"]);
    expect(result.status).toBe(200);
    expect(result.method).toBe("GET");
  });

  it("finds a redirect that only appears on the GET fallback", async () => {
    const result = await resolveHop(new URL(server.url("/head-405-redirect")), options());
    expect(result.next?.url.href).toBe(server.url("/end"));
  });

  it("does not fetch a body for non-HTML responses", async () => {
    const before = server.requests.length;
    const result = await resolveHop(new URL(server.url("/not-html")), options());
    expect(server.requests.slice(before)).toEqual(["HEAD /not-html"]);
    expect(result.status).toBe(200);
  });

  it("reads the document title of an HTML page and decodes entities", async () => {
    const result = await resolveHop(new URL(server.url("/html")), options());
    expect(result.documentTitle).toBe("Café & Bar");
  });

  it("reports 4xx and 5xx as results rather than failures", async () => {
    const notFound = await resolveHop(new URL(server.url("/404")), options());
    expect(notFound.status).toBe(404);
    expect(notFound.error).toBeUndefined();

    const serverError = await resolveHop(new URL(server.url("/500")), options());
    expect(serverError.status).toBe(500);
    expect(serverError.error).toBeUndefined();
  });

  it("reports a timeout as an error rather than hanging", async () => {
    const result = await resolveHop(new URL(server.url("/slow")), options({ timeoutMs: 300 }));
    expect(result.error).toMatch(/timed out/i);
  });

  it("reports an unresolvable host", async () => {
    const result = await resolveHop(new URL("http://this-host-does-not-exist.invalid/"), options({ timeoutMs: 3_000 }));
    expect(result.error).toBeDefined();
  });

  describe("meta refresh", () => {
    it("follows one with a short delay", async () => {
      const result = await resolveHop(new URL(server.url("/meta")), options());
      expect(result.next?.url.href).toBe(server.url("/end"));
      expect(result.next?.via).toBe("meta-refresh");
    });

    it("resolves an absolute meta refresh target", async () => {
      const result = await resolveHop(new URL(server.url("/meta-absolute")), options());
      expect(result.next?.url.href).toBe(server.url("/end"));
    });

    it("ignores one with a long delay, treating it as content", async () => {
      const result = await resolveHop(new URL(server.url("/meta-slow")), options());
      expect(result.next).toBeUndefined();
      expect(result.status).toBe(200);
    });

    it("ignores one pointing at the same URL", async () => {
      const result = await resolveHop(new URL(server.url("/meta-self")), options());
      expect(result.next).toBeUndefined();
    });

    it("reads through gzip when a server ignores Accept-Encoding: identity", async () => {
      const result = await resolveHop(new URL(server.url("/meta-gzip")), options());
      expect(result.next?.url.href).toBe(server.url("/end"));
    });

    it("is skipped entirely when disabled, and then costs no GET", async () => {
      const before = server.requests.length;
      const result = await resolveHop(new URL(server.url("/meta")), options({ followMetaRefresh: false }));
      expect(result.next).toBeUndefined();
      expect(server.requests.slice(before)).toEqual(["HEAD /meta"]);
    });

    it("stops reading at the byte cap instead of buffering a huge body", async () => {
      // /big pads a megabyte of comment before the meta tag, so a capped read
      // cannot see it. Finding no redirect here is the pass condition.
      const result = await resolveHop(new URL(server.url("/big")), options({ maxBodyBytes: 4096 }));
      expect(result.next).toBeUndefined();
      expect(result.status).toBe(200);
    });
  });
});

describe("expandChain", () => {
  it("walks a chain to its destination", async () => {
    const chain = await expandFully(new URL(server.url("/redirect/3")), options());
    expect(chain.status).toBe("final");
    expect(urls(chain)).toEqual([
      server.url("/redirect/3"),
      server.url("/redirect/2"),
      server.url("/redirect/1"),
      server.url("/end"),
    ]);
  });

  it("records how each hop was reached", async () => {
    const chain = await expandFully(new URL(server.url("/meta")), options());
    expect(chain.hops.map((hop) => hop.via)).toEqual(["start", "meta-refresh"]);
  });

  it("returns a single final hop for a URL that does not redirect", async () => {
    const chain = await expandFully(new URL(server.url("/end")), options());
    expect(chain.status).toBe("final");
    expect(chain.hops).toHaveLength(1);
  });

  it("yields a snapshot per state change, with hop 0 known before any request", async () => {
    const snapshots: Chain[] = [];
    for await (const chain of expandChain(new URL(server.url("/redirect/2")), options())) {
      snapshots.push(chain);
    }
    // First snapshot is the source URL, pending.
    expect(snapshots[0]?.hops).toHaveLength(1);
    expect(snapshots[0]?.hops[0]?.status).toBeUndefined();
    // Chain grows monotonically and ends resolved.
    expect(snapshots.map((chain) => chain.hops.length)).toEqual([1, 2, 3, 3]);
    expect(snapshots.at(-1)?.status).toBe("final");
  });

  it("hands out independent snapshots that later mutation cannot touch", async () => {
    const snapshots: Chain[] = [];
    for await (const chain of expandChain(new URL(server.url("/redirect/1")), options())) {
      snapshots.push(chain);
    }
    // The first snapshot must still show hop 0 unresolved even though the
    // generator went on to fill that hop in.
    expect(snapshots[0]?.hops[0]?.status).toBeUndefined();
    expect(snapshots.at(-1)?.hops[0]?.status).toBe(302);
  });

  it("detects a two-URL loop", async () => {
    const chain = await expandFully(new URL(server.url("/loop-a")), options());
    expect(chain.status).toBe("loop");
    expect(chain.message).toMatch(/loop/i);
  });

  it("detects a self-loop", async () => {
    const chain = await expandFully(new URL(server.url("/self-loop")), options());
    expect(chain.status).toBe("loop");
  });

  it("stops at maxHops on an endless chain", async () => {
    const chain = await expandFully(new URL(server.url("/infinite")), options({ maxHops: 5 }));
    expect(chain.status).toBe("max-hops");
    expect(chain.hops).toHaveLength(5);
  });

  it("keeps the partial chain when a hop fails", async () => {
    const chain = await expandFully(new URL(server.url("/redirect/1")), options({ maxHops: 20 }));
    expect(chain.hops.length).toBeGreaterThan(1);

    const failing = await expandFully(new URL(server.url("/no-location")), options());
    expect(failing.status).toBe("error");
    expect(failing.hops).toHaveLength(1);
    expect(failing.hops[0]?.status).toBe(302);
  });

  it("flags tracking parameters on each hop", async () => {
    const chain = await expandFully(new URL(server.url("/end?utm_source=x&keep=1")), options());
    expect(chain.hops[0]?.trackingParams).toEqual(["utm_source"]);
  });

  describe("step-by-step mode", () => {
    /**
     * The behaviour that justifies the whole generator design: pulling once
     * reveals the next URL without ever requesting it. That is what makes the
     * extension safe to point at a single-use link.
     */
    it("reveals the next URL without requesting it", async () => {
      const before = server.requests.length;
      const generator = expandChain(new URL(server.url("/redirect/3")), options());

      await generator.next(); // initial snapshot, no request yet
      expect(server.requests.slice(before)).toEqual([]);

      const afterOne = await generator.next(); // resolves hop 0 only
      const chain = afterOne.value as Chain;

      expect(server.requests.slice(before)).toEqual(["HEAD /redirect/3"]);
      expect(chain.status).toBe("paused");
      expect(chain.hops).toHaveLength(2);
      // Hop 1's URL is known...
      expect(chain.hops[1]?.url).toBe(server.url("/redirect/2"));
      // ...but it has not been requested.
      expect(chain.hops[1]?.status).toBeUndefined();

      await generator.return(undefined as never);
      expect(server.requests.slice(before)).toEqual(["HEAD /redirect/3"]);
    });

    it("issues exactly one request per step", async () => {
      const before = server.requests.length;
      const generator = expandChain(new URL(server.url("/redirect/3")), options());

      await generator.next();
      await generator.next();
      await generator.next();

      expect(server.requests.slice(before)).toEqual(["HEAD /redirect/3", "HEAD /redirect/2"]);
      await generator.return(undefined as never);
    });
  });

  describe("cancellation", () => {
    it("stops when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const chain = await expandFully(new URL(server.url("/redirect/3")), options(), controller.signal);
      expect(chain.status).toBe("stopped");
    });

    it("reports a mid-flight abort as stopped, not as an error", async () => {
      const controller = new AbortController();
      const promise = expandFully(new URL(server.url("/slow")), options({ timeoutMs: 5_000 }), controller.signal);
      setTimeout(() => controller.abort(), 100);
      const chain = await promise;
      expect(chain.status).toBe("stopped");
    });
  });

  describe("address guarding", () => {
    it("refuses to start on a blocked host", async () => {
      // Same local server, but with the guard switched on as it is by default.
      const chain = await expandFully(new URL(server.url("/end")), options({ blockPrivateHosts: true }));
      expect(chain.status).toBe("error");
      expect(chain.hops[0]?.error).toMatch(/private, loopback|local hostname/i);
    });

    it("refuses a non-http scheme", async () => {
      const chain = await expandFully(new URL("file:///etc/passwd"), options());
      expect(chain.status).toBe("error");
      expect(chain.hops[0]?.error).toMatch(/not supported/i);
    });

    it("makes no request at all when the host is blocked", async () => {
      const before = server.requests.length;
      await expandFully(new URL(server.url("/redirect/3")), options({ blockPrivateHosts: true }));
      expect(server.requests.slice(before)).toEqual([]);
    });
  });
});
