/** How we arrived at a given URL from the previous one. */
export type HopVia = "start" | "http" | "meta-refresh";

export type RequestMethod = "HEAD" | "GET";

/** One URL in a redirect chain, together with what we learned about it. */
export interface Hop {
  /** Zero-based position in the chain. Hop 0 is the URL the user supplied. */
  index: number;
  url: string;
  via: HopVia;
  /** HTTP status of the response for *this* URL. Absent while pending. */
  status?: number;
  statusText?: string;
  method?: RequestMethod;
  contentType?: string;
  server?: string;
  elapsedMs?: number;
  /** `<title>` of the document. Only read for terminal HTML hops. */
  documentTitle?: string;
  /** Names of query parameters on this URL that look like trackers. */
  trackingParams?: string[];
  /** This hop could not be resolved; the chain stops here. */
  error?: string;
}

export type ChainStatus =
  /** Nothing has been requested yet. */
  | "idle"
  /** A request is in flight. */
  | "running"
  /** A next hop exists and is waiting for the user (step mode). */
  | "paused"
  /** A terminal response was reached. */
  | "final"
  /** Stopped because `maxHops` was reached. */
  | "max-hops"
  /** Stopped because a URL repeated. */
  | "loop"
  /** Stopped because the caller aborted. */
  | "stopped"
  /** The last hop failed. */
  | "error";

export interface Chain {
  /** The URL the chain started from, as supplied. */
  source: string;
  hops: Hop[];
  status: ChainStatus;
  /** Human-readable explanation for a terminal status. */
  message?: string;
}

/** A chain is done when no further hop can be resolved from it. */
export const TERMINAL_STATUSES: readonly ChainStatus[] = ["final", "max-hops", "loop", "stopped", "error"];

export function isTerminal(status: ChainStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface ExpandOptions {
  /** Hard ceiling on chain length, including hop 0. */
  maxHops: number;
  /** Per-request deadline, covering DNS, connect and response headers. */
  timeoutMs: number;
  userAgent: string;
  /** Parse `<meta http-equiv="refresh">` as a redirect. */
  followMetaRefresh: boolean;
  /** Refuse to connect to loopback, private and link-local addresses. */
  blockPrivateHosts: boolean;
  /** Read ceiling when a body is needed at all. */
  maxBodyBytes: number;
  /** Meta refreshes with a longer delay are treated as content, not redirects. */
  metaRefreshMaxDelaySeconds: number;
  /** Also treat contextual parameters (`ref`, `s`, `source`) as trackers. */
  aggressiveTracking: boolean;
}

export const DEFAULT_EXPAND_OPTIONS: ExpandOptions = {
  maxHops: 20,
  timeoutMs: 10_000,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  followMetaRefresh: true,
  blockPrivateHosts: true,
  maxBodyBytes: 64 * 1024,
  metaRefreshMaxDelaySeconds: 5,
  aggressiveTracking: false,
};
