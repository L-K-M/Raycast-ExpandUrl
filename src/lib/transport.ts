import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { createGuardedLookup } from "./guards";
import type { RequestMethod } from "./types";

/**
 * A single HTTP request, issued with `node:http`/`node:https` rather than
 * `fetch`.
 *
 * Three properties of the lower-level API are load-bearing here:
 *
 *  1. It accepts a custom `lookup`, so the resolved address can be checked at
 *     the moment the socket is opened. `fetch` cannot do this without taking on
 *     `undici` as a direct dependency, and a version skew against the copy Node
 *     already embeds is a nasty failure mode inside a bundled extension.
 *  2. It does not follow redirects at all, so "do not follow redirects" is the
 *     default rather than an opt-out that could be dropped in a refactor.
 *  3. The response is a stream we own, so the read cap is enforced by
 *     destroying the socket instead of hoping a reader stops early.
 */

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  /** Present only when `maxBodyBytes` was set. May be truncated. */
  body?: string;
  bodyTruncated?: boolean;
  elapsedMs: number;
}

export interface RequestOptions {
  method: RequestMethod;
  timeoutMs: number;
  userAgent: string;
  /** Validate resolved addresses at connect time. */
  guardAddresses: boolean;
  /** When set, read up to this many bytes of the body. When unset, no body. */
  maxBodyBytes?: number;
  signal?: AbortSignal;
}

export class RequestTimeoutError extends Error {
  override readonly name = "RequestTimeoutError";
}

/** Decompresses when a server ignores our `Accept-Encoding: identity`. */
function decodeBody(stream: Readable, encoding: string | undefined): Readable {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return stream.pipe(zlib.createGunzip());
    case "deflate":
      return stream.pipe(zlib.createInflate());
    case "br":
      return stream.pipe(zlib.createBrotliDecompress());
    default:
      return stream;
  }
}

/**
 * Reads at most `limit` bytes, then stops. The underlying socket is destroyed
 * rather than drained, so a huge response costs us `limit` bytes and not a byte
 * more.
 */
function readCapped(
  stream: Readable,
  raw: http.IncomingMessage,
  limit: number,
): Promise<{ text: string; truncated: boolean }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (truncated: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ text: Buffer.concat(chunks).toString("utf8"), truncated });
    };

    stream.on("data", (chunk: Buffer) => {
      const remaining = limit - total;
      if (remaining <= 0) return;
      if (chunk.length >= remaining) {
        chunks.push(chunk.subarray(0, remaining));
        total = limit;
        raw.destroy();
        finish(true);
        return;
      }
      chunks.push(chunk);
      total += chunk.length;
    });

    stream.on("end", () => finish(false));
    // A decompression failure or an aborted socket still leaves us whatever we
    // managed to read, which is usually enough to find a <meta> tag.
    stream.on("error", () => finish(true));
    raw.on("error", () => finish(true));
  });
}

export function request(url: URL, options: RequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const startedAt = process.hrtime.bigint();
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.request({
      protocol: url.protocol,
      hostname: stripBrackets(url.hostname),
      port: url.port.length > 0 ? url.port : undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method,
      // A one-off agent keeps connections from being pooled and reused across
      // hops, which would otherwise let hop N's socket serve hop N+1.
      agent: false,
      lookup: options.guardAddresses ? createGuardedLookup() : undefined,
      headers: {
        "user-agent": options.userAgent,
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        // Reading only the first few KiB of a compressed body is useless, so
        // ask for none. `decodeBody` handles servers that ignore this.
        "accept-encoding": "identity",
        // Deliberately absent: cookie, authorization. Nothing from hop N is
        // ever forwarded to hop N+1.
      },
    });

    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      req.destroy();
      reject(error);
    };
    const succeed = (response: HttpResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(response);
    };

    // One deadline covering DNS, connect, TLS and response headers.
    // `req.setTimeout` only measures socket inactivity, which a slow-drip
    // server can keep resetting forever.
    const timer = setTimeout(() => {
      fail(new RequestTimeoutError(`timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    const onAbort = () => fail(new Error("cancelled"));
    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        fail(new Error("cancelled"));
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    req.on("error", fail);

    req.on("response", (res) => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const base: HttpResponse = {
        status: res.statusCode ?? 0,
        statusText: res.statusMessage ?? "",
        headers: res.headers,
        elapsedMs,
      };

      if (options.maxBodyBytes === undefined || options.maxBodyBytes <= 0) {
        // Nothing wants the body; free the socket immediately.
        res.destroy();
        succeed(base);
        return;
      }

      const decoded = decodeBody(res, res.headers["content-encoding"]);
      void readCapped(decoded, res, options.maxBodyBytes).then(({ text, truncated }) => {
        succeed({ ...base, body: text, bodyTruncated: truncated });
      });
    });

    req.end();
  });
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}
