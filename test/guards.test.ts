import { describe, expect, it } from "vitest";
import { checkAddress, checkHostname, checkUrl, stripBrackets } from "../src/lib/guards";

/**
 * These are the tests that matter most in this repo. The extension follows
 * redirects chosen by whoever controls the previous hop, so a hole here turns
 * it into an SSRF gadget pointed at the user's own network.
 */

describe("checkAddress", () => {
  const blocked = [
    ["loopback", "127.0.0.1"],
    ["loopback, non-.1", "127.99.88.77"],
    ["this network", "0.0.0.0"],
    ["RFC1918 /8", "10.1.2.3"],
    ["RFC1918 /12", "172.16.0.1"],
    ["RFC1918 /12 upper", "172.31.255.254"],
    ["RFC1918 /16", "192.168.1.1"],
    ["CGNAT", "100.64.0.1"],
    ["link-local", "169.254.1.1"],
    ["cloud metadata", "169.254.169.254"],
    ["IETF protocol assignments", "192.0.0.1"],
    ["benchmarking", "198.18.0.1"],
    ["multicast", "224.0.0.1"],
    ["reserved", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["IPv6 unspecified", "::"],
    ["IPv6 loopback", "::1"],
    ["IPv6 ULA", "fd00::1"],
    ["IPv6 ULA lower bound", "fc00::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 multicast", "ff02::1"],
  ] as const;

  it.each(blocked)("blocks %s (%s)", (_label, address) => {
    expect(checkAddress(address)).toBeDefined();
  });

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111"];

  it.each(allowed)("allows public address %s", (address) => {
    expect(checkAddress(address)).toBeUndefined();
  });

  it("rejects anything that is not an IP address", () => {
    expect(checkAddress("example.com")).toBeDefined();
    expect(checkAddress("")).toBeDefined();
  });

  /**
   * Regression tests for the two ways an IPv4-mapped IPv6 address slips past a
   * naive check. `new URL("http://[::ffff:127.0.0.1]/")` produces the hostname
   * `[::ffff:7f00:1]` — brackets retained, and the embedded IPv4 re-encoded as
   * hex — so neither `net.isIP()` nor a string comparison against the dotted
   * form does what you would expect.
   */
  describe("IPv4-mapped IPv6", () => {
    const mapped = [
      "::ffff:127.0.0.1",
      "::ffff:7f00:1", // the same address, as new URL() spells it
      "::ffff:10.0.0.1",
      "::ffff:a00:1",
      "::ffff:169.254.169.254",
      "::ffff:a9fe:a9fe",
      "::ffff:192.168.0.1",
    ];

    it.each(mapped)("blocks %s", (address) => {
      expect(checkAddress(address)).toBeDefined();
    });

    it("still allows a mapped public address", () => {
      expect(checkAddress("::ffff:8.8.8.8")).toBeUndefined();
    });

    it("blocks the form new URL() actually produces", () => {
      const hostname = new URL("http://[::ffff:127.0.0.1]/").hostname;
      // Documents the trap: the brackets survive parsing.
      expect(hostname).toBe("[::ffff:7f00:1]");
      expect(checkAddress(stripBrackets(hostname))).toBeDefined();
      expect(checkHostname(hostname)).toBeDefined();
    });
  });

  /**
   * NAT64 and 6to4 also embed an IPv4 address, and BlockList does not unwrap
   * them. Both prefixes are refused outright instead.
   */
  describe("IPv6 transition prefixes", () => {
    it("blocks NAT64", () => {
      expect(checkAddress("64:ff9b::7f00:1")).toBeDefined();
      expect(checkAddress("64:ff9b::808:808")).toBeDefined();
    });

    it("blocks 6to4", () => {
      expect(checkAddress("2002:7f00:1::")).toBeDefined();
      expect(checkAddress("2002:c0a8:1::1")).toBeDefined();
    });
  });
});

describe("checkHostname", () => {
  it.each(["localhost", "LOCALHOST", "foo.localhost", "printer.local", "db.internal", "router.home.arpa"])(
    "blocks local hostname %s",
    (hostname) => {
      expect(checkHostname(hostname)).toBeDefined();
    },
  );

  it("blocks an empty host", () => {
    expect(checkHostname("")).toBeDefined();
  });

  it("allows ordinary public hostnames", () => {
    expect(checkHostname("example.com")).toBeUndefined();
    expect(checkHostname("bit.ly")).toBeUndefined();
    // Not a local host despite the substring.
    expect(checkHostname("localhost.example.com")).toBeUndefined();
  });

  it("blocks literal private IPs given as hostnames", () => {
    expect(checkHostname("127.0.0.1")).toBeDefined();
    expect(checkHostname("[::1]")).toBeDefined();
  });

  /**
   * Alternate IPv4 literal encodings need no special handling because WHATWG
   * URL normalises them during parsing. This test exists to prove that, so
   * nobody later "fixes" it by hand-rolling a decimal/octal/hex parser and
   * introduces a parser differential.
   */
  it.each([
    ["decimal", "http://2130706433/"],
    ["hex", "http://0x7f000001/"],
    ["octal", "http://0177.0.0.1/"],
    ["dotted", "http://127.0.0.1/"],
  ])("normalises %s IPv4 literals during parsing", (_label, input) => {
    const url = new URL(input);
    expect(url.hostname).toBe("127.0.0.1");
    expect(checkHostname(url.hostname)).toBeDefined();
  });
});

describe("checkUrl", () => {
  const strict = { blockPrivateHosts: true };

  it.each(["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "ftp://example.com/"])(
    "rejects the %s scheme",
    (input) => {
      expect(checkUrl(new URL(input), strict)).toBeDefined();
    },
  );

  it("accepts http and https", () => {
    expect(checkUrl(new URL("http://example.com/"), strict)).toBeUndefined();
    expect(checkUrl(new URL("https://example.com/"), strict)).toBeUndefined();
  });

  it("rejects private hosts when blocking is on", () => {
    expect(checkUrl(new URL("http://127.0.0.1:8080/admin"), strict)).toBeDefined();
    expect(checkUrl(new URL("http://169.254.169.254/latest/meta-data/"), strict)).toBeDefined();
  });

  it("allows private hosts when blocking is off", () => {
    expect(checkUrl(new URL("http://127.0.0.1:8080/admin"), { blockPrivateHosts: false })).toBeUndefined();
  });

  it("still rejects non-http schemes when blocking is off", () => {
    // Turning off private-host blocking must not turn off the scheme allow-list.
    expect(checkUrl(new URL("file:///etc/passwd"), { blockPrivateHosts: false })).toBeDefined();
  });
});
