import net from "node:net";
import type { LookupFunction } from "node:net";
import dns from "node:dns";

/**
 * Policy for deciding which URLs and addresses this extension is willing to
 * talk to.
 *
 * This matters more here than in a typical HTTP client: the extension follows
 * redirects, and hop N chooses the target of hop N+1. Without a policy, any
 * public shortener could steer us at `http://169.254.169.254/` or a host on the
 * user's LAN. Everything below exists to make that steering fail closed.
 */

export class BlockedAddressError extends Error {
  override readonly name = "BlockedAddressError";
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Hostnames refused before any resolution is attempted. Resolution of these is
 * configured per-machine and cannot be reasoned about, so there is no point
 * asking DNS what they mean.
 */
const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  // Single-label forms; the suffix list above only catches "foo.local".
  "local",
  "internal",
  "home.arpa",
]);

/**
 * Address ranges we refuse to connect to.
 *
 * `net.BlockList` does the matching, deliberately: it parses addresses with
 * Node's own parser and — verified, not assumed — already resolves IPv4-mapped
 * IPv6 against IPv4 rules, including the hex spelling that `new URL()` produces
 * (`http://[::ffff:127.0.0.1]/` normalises to `[::ffff:7f00:1]`). Hand-rolling
 * address parsing on top of that would add a parser differential, which is how
 * these guards get bypassed in the first place.
 */
function buildBlockList(): net.BlockList {
  const list = new net.BlockList();

  // "This network", loopback, link-local (incl. cloud metadata at
  // 169.254.169.254), RFC 1918 private, CGNAT, IETF protocol assignments,
  // benchmarking, multicast and reserved space.
  list.addSubnet("0.0.0.0", 8, "ipv4");
  list.addSubnet("10.0.0.0", 8, "ipv4");
  list.addSubnet("100.64.0.0", 10, "ipv4");
  list.addSubnet("127.0.0.0", 8, "ipv4");
  list.addSubnet("169.254.0.0", 16, "ipv4");
  list.addSubnet("172.16.0.0", 12, "ipv4");
  list.addSubnet("192.0.0.0", 24, "ipv4");
  list.addSubnet("192.168.0.0", 16, "ipv4");
  list.addSubnet("198.18.0.0", 15, "ipv4");
  list.addSubnet("224.0.0.0", 4, "ipv4");
  list.addSubnet("240.0.0.0", 4, "ipv4");

  // Unspecified, loopback, unique-local, link-local and multicast.
  list.addAddress("::", "ipv6");
  list.addAddress("::1", "ipv6");
  list.addSubnet("fc00::", 7, "ipv6");
  list.addSubnet("fe80::", 10, "ipv6");
  list.addSubnet("ff00::", 8, "ipv6");

  // IPv4-compatible IPv6 (::a.b.c.d), deprecated by RFC 4291. BlockList unwraps
  // the *mapped* form (::ffff:a.b.c.d) but not this older one, so ::127.0.0.1 --
  // which new URL() spells [::7f00:1] -- matched no rule at all. Blocking the
  // whole ::/96 range closes it; the range is deprecated and non-routable, and
  // it does not overlap ::ffff:0:0/96, so mapped public addresses are unaffected.
  list.addSubnet("::", 96, "ipv6");

  // BlockList unwraps IPv4-mapped IPv6, but not these two transition formats,
  // which also embed an IPv4 address. Rather than hand-decode the embedded
  // address, refuse the prefixes outright: NAT64 is a translation prefix that
  // only means something inside a network we are not part of, and 6to4 was
  // deprecated by RFC 7526. Neither belongs in a URL a user pasted.
  list.addSubnet("64:ff9b::", 96, "ipv6");
  list.addSubnet("2002::", 16, "ipv6");

  return list;
}

const BLOCK_LIST = buildBlockList();

/** Returns a reason string when the address must not be connected to. */
export function checkAddress(address: string): string | undefined {
  const family = net.isIP(address);
  if (family === 0) {
    return `${address} is not a valid IP address`;
  }
  if (BLOCK_LIST.check(address, family === 4 ? "ipv4" : "ipv6")) {
    return `${address} is a private, loopback or otherwise non-routable address`;
  }
  return undefined;
}

/** Returns a reason string when the hostname must not be resolved at all. */
export function checkHostname(hostname: string): string | undefined {
  // `new URL()` keeps the brackets on IPv6 literals, which defeats net.isIP.
  const host = stripBrackets(hostname).toLowerCase();

  if (host.length === 0) {
    return "the URL has no host";
  }
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return `${host} is a local hostname`;
  }
  // Literal IPs skip DNS entirely, so check them here as well as at connect
  // time. The connect-time check is the one that actually protects us; this
  // one just produces a better message, sooner.
  if (net.isIP(host) !== 0) {
    return checkAddress(host);
  }
  return undefined;
}

export function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/** Returns a reason string when the URL must not be requested. */
export function checkUrl(url: URL, options: { blockPrivateHosts: boolean }): string | undefined {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return `${url.protocol} URLs are not supported, only http and https`;
  }
  if (!options.blockPrivateHosts) {
    return url.hostname.length === 0 ? "the URL has no host" : undefined;
  }
  return checkHostname(url.hostname);
}

/**
 * A DNS lookup that validates every address before the socket is created.
 *
 * This is the guard that actually holds. Resolving a hostname up front and
 * trusting the answer afterwards leaves a window in which DNS can hand the
 * socket a different address than the one that was checked — a rebinding
 * attack. Because `http.request` calls this function to obtain the address it
 * is about to connect to, there is no such window.
 *
 * `all: true` is forced so that every address is seen. One bad address rejects
 * the whole connection rather than being filtered out: a host that resolves to
 * both a public and a private address is not a host worth talking to.
 */
export function createGuardedLookup(): LookupFunction {
  return function guardedLookup(hostname, options, callback) {
    // Node calls back with either a single address or an array, depending on
    // `options.all`. Always resolve with `all: true`, then reshape to match
    // what the caller asked for.
    const wantsAll = typeof options === "object" && options !== null && options.all === true;
    const family = typeof options === "object" && options !== null ? options.family : undefined;

    dns.lookup(hostname, { all: true, family: family === 4 || family === 6 ? family : 0 }, (error, addresses) => {
      if (error) {
        callback(error, "", 0);
        return;
      }

      for (const entry of addresses) {
        const reason = checkAddress(entry.address);
        if (reason !== undefined) {
          callback(new BlockedAddressError(`refusing to connect to ${hostname}: ${reason}`), "", 0);
          return;
        }
      }

      const first = addresses[0];
      if (first === undefined) {
        callback(new Error(`${hostname} did not resolve to any address`), "", 0);
        return;
      }

      if (wantsAll) {
        (callback as (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void)(null, addresses);
      } else {
        callback(null, first.address, first.family);
      }
    });
  } as LookupFunction;
}
