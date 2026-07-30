import { checkUrl } from "./guards";
import { findDocumentTitle, findMetaRefresh, isHtmlContentType } from "./html";
import { request, RequestTimeoutError } from "./transport";
import { findTrackingParams } from "./tracking";
import { loopKey, resolveLocation } from "./url";
import type { Chain, ExpandOptions, Hop, HopVia, RequestMethod } from "./types";

/**
 * Statuses that mean "this server will not answer a HEAD request".
 *
 * 403 is in here because a surprising number of CDNs answer HEAD with a 403 and
 * the same URL with 200 for GET.
 */
const HEAD_UNSUPPORTED = new Set([400, 401, 403, 405, 406, 501]);

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** What we learned by requesting one URL. */
export interface ResolvedHop {
  status?: number;
  statusText?: string;
  method?: RequestMethod;
  contentType?: string;
  server?: string;
  elapsedMs?: number;
  documentTitle?: string;
  error?: string;
  /** Where this URL points, if it points anywhere. */
  next?: { url: URL; via: HopVia };
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const raw = headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Requests a single URL and reports what it says about where to go next.
 *
 * Never throws: a blocked host, a timeout or a dead socket all come back as a
 * hop carrying an `error`. A failed hop is still a result worth showing — "hop
 * 3 times out" is an answer.
 */
export async function resolveHop(url: URL, options: ExpandOptions, signal?: AbortSignal): Promise<ResolvedHop> {
  const blocked = checkUrl(url, options);
  if (blocked !== undefined) {
    return { error: blocked };
  }

  const base = {
    method: "HEAD" as RequestMethod,
    timeoutMs: options.timeoutMs,
    userAgent: options.userAgent,
    guardAddresses: options.blockPrivateHosts,
    signal,
  };

  try {
    let response = await request(url, base);
    let method: RequestMethod = "HEAD";

    // A redirect is all we need; no body, no second request.
    if (isRedirectStatus(response.status)) {
      return redirectResult(response.status, response.statusText, response.headers, response.elapsedMs, method, url);
    }

    const contentType = headerValue(response.headers, "content-type");
    const wantsBody =
      HEAD_UNSUPPORTED.has(response.status) || (options.followMetaRefresh && isHtmlContentType(contentType));

    if (wantsBody) {
      // Either the server refuses HEAD, or this is an HTML page that might
      // carry a meta refresh. Both need a real GET.
      response = await request(url, { ...base, method: "GET", maxBodyBytes: options.maxBodyBytes });
      method = "GET";

      if (isRedirectStatus(response.status)) {
        return redirectResult(response.status, response.statusText, response.headers, response.elapsedMs, method, url);
      }
    }

    const finalContentType = headerValue(response.headers, "content-type");
    const result: ResolvedHop = {
      status: response.status,
      statusText: response.statusText,
      method,
      contentType: finalContentType,
      server: headerValue(response.headers, "server"),
      elapsedMs: response.elapsedMs,
    };

    if (response.body === undefined || !isHtmlContentType(finalContentType)) {
      return result;
    }

    result.documentTitle = findDocumentTitle(response.body);

    if (!options.followMetaRefresh) {
      return result;
    }

    const refresh = findMetaRefresh(response.body);
    if (refresh === undefined || refresh.delaySeconds > options.metaRefreshMaxDelaySeconds) {
      // A long delay is a page that happens to reload itself, not a redirect.
      return result;
    }

    const target = resolveLocation(refresh.target, url);
    if (target === undefined || target.href === url.href) {
      // A meta refresh pointing at itself is a self-refreshing page.
      return result;
    }

    return { ...result, next: { url: target, via: "meta-refresh" } };
  } catch (error) {
    return { error: describeError(error) };
  }
}

function redirectResult(
  status: number,
  statusText: string,
  headers: Record<string, string | string[] | undefined>,
  elapsedMs: number,
  method: RequestMethod,
  from: URL,
): ResolvedHop {
  const result: ResolvedHop = {
    status,
    statusText,
    method,
    elapsedMs,
    contentType: headerValue(headers, "content-type"),
    server: headerValue(headers, "server"),
  };

  const location = headerValue(headers, "location");
  if (location === undefined || location.trim().length === 0) {
    return { ...result, error: `${status} response without a Location header` };
  }

  const target = resolveLocation(location, from);
  if (target === undefined) {
    return { ...result, error: `${status} response with an unparseable Location: ${location}` };
  }

  return { ...result, next: { url: target, via: "http" } };
}

function describeError(error: unknown): string {
  if (error instanceof RequestTimeoutError) return error.message;
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    switch (code) {
      case "ENOTFOUND":
      case "EAI_AGAIN":
        return "host not found";
      case "ECONNREFUSED":
        return "connection refused";
      case "ECONNRESET":
        return "connection reset";
      case "CERT_HAS_EXPIRED":
        return "the server's TLS certificate has expired";
      default:
        return error.message;
    }
  }
  return String(error);
}

/**
 * Reads the abort flag through a function call.
 *
 * Inlining `signal?.aborted === true` twice makes TypeScript narrow the second
 * check to `false` off the back of the first, which is wrong: the flag can flip
 * during the `await` between them. Hiding the read behind a call keeps the
 * check honest.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

function makeHop(index: number, url: URL, via: HopVia, options: ExpandOptions): Hop {
  const tracking = findTrackingParams(url, { aggressive: options.aggressiveTracking });
  return {
    index,
    url: url.href,
    via,
    ...(tracking.length > 0 ? { trackingParams: tracking } : {}),
  };
}

/**
 * Walks a redirect chain, yielding a fresh snapshot after every state change.
 *
 * The generator is what lets one implementation serve both expansion modes.
 * A consumer that keeps pulling gets the full chain streamed in as it resolves;
 * a consumer that stops pulling has performed exactly the requests it asked
 * for.
 *
 * The pause point matters as much as the streaming: resolving hop N reveals
 * hop N+1's *URL* without requesting it, because that URL came out of hop N's
 * `Location` header. So a step-mode user learns where a link goes without ever
 * touching the destination — which is the whole point for single-use links.
 */
export async function* expandChain(
  source: URL,
  options: ExpandOptions,
  signal?: AbortSignal,
): AsyncGenerator<Chain, Chain, void> {
  const hops: Hop[] = [makeHop(0, source, "start", options)];
  const seen = new Set<string>([loopKey(source)]);
  const chain: Chain = { source: source.href, hops, status: "running" };

  const snapshot = (): Chain => ({ ...chain, hops: hops.map((hop) => ({ ...hop })) });

  const terminal = (status: Chain["status"], message?: string): Chain => {
    chain.status = status;
    if (message !== undefined) chain.message = message;
    return snapshot();
  };

  yield snapshot();

  for (;;) {
    if (isAborted(signal)) {
      const stopped = terminal("stopped", "Expansion stopped");
      yield stopped;
      return stopped;
    }

    const pending = hops.at(-1);
    /* v8 ignore next 5 -- hops is never empty; this is a type narrowing guard. */
    if (pending === undefined) {
      const broken = terminal("error", "Internal error: empty chain");
      yield broken;
      return broken;
    }

    const current = new URL(pending.url);
    const resolved = await resolveHop(current, options, signal);

    Object.assign(pending, {
      status: resolved.status,
      statusText: resolved.statusText,
      method: resolved.method,
      contentType: resolved.contentType,
      server: resolved.server,
      elapsedMs: resolved.elapsedMs,
      documentTitle: resolved.documentTitle,
      error: resolved.error,
    });

    if (resolved.error !== undefined) {
      // Distinguish "the user cancelled" from "the request failed"; only the
      // latter is worth showing as an error.
      const ended = isAborted(signal) ? terminal("stopped", "Expansion stopped") : terminal("error", resolved.error);
      yield ended;
      return ended;
    }

    if (resolved.next === undefined) {
      const done = terminal("final");
      yield done;
      return done;
    }

    const nextKey = loopKey(resolved.next.url);
    if (seen.has(nextKey)) {
      const looped = terminal("loop", `Redirect loop: ${resolved.next.url.href} was already visited`);
      yield looped;
      return looped;
    }

    if (hops.length >= options.maxHops) {
      const capped = terminal("max-hops", `Stopped after ${options.maxHops} hops`);
      yield capped;
      return capped;
    }

    seen.add(nextKey);
    hops.push(makeHop(hops.length, resolved.next.url, resolved.next.via, options));

    // The next URL is known but not yet requested. A step-mode consumer stops
    // here; a full-chain consumer calls next() and the loop continues.
    chain.status = "paused";
    yield snapshot();
    chain.status = "running";
  }
}

/**
 * Convenience wrapper that drains the generator.
 *
 * Safe to write with `for await` because the terminal snapshot is yielded as
 * well as returned — a generator's return value is invisible to `for await`,
 * so relying on it would silently hand callers a mid-flight chain.
 */
export async function expandFully(source: URL, options: ExpandOptions, signal?: AbortSignal): Promise<Chain> {
  let last: Chain = { source: source.href, hops: [], status: "idle" };
  for await (const chain of expandChain(source, options, signal)) {
    last = chain;
  }
  return last;
}
