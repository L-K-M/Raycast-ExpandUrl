import { expandFully } from "../lib/expand";
import { finalHop } from "../lib/format";
import { stripTrackingParams } from "../lib/tracking";
import { parseInput } from "../lib/url";
import { getSettings } from "../preferences";

/**
 * AI tool: expand a URL and report the whole chain.
 *
 * Returns every hop rather than just the destination, for the same reason the
 * UI does — an assistant asked "where does this link go?" should be able to say
 * "through two tracking domains, then here", not just name the last one.
 */

export interface Input {
  /** The URL to expand. May be a bare host such as `bit.ly/abc`. */
  url: string;
}

interface ToolHop {
  position: number;
  url: string;
  reachedBy: "start" | "http" | "meta-refresh";
  status?: number;
  trackingParameters?: string[];
  error?: string;
}

interface ToolResult {
  source: string;
  hops: ToolHop[];
  finalUrl?: string;
  finalUrlWithoutTracking?: string;
  destinationTitle?: string;
  redirectCount: number;
  outcome: string;
  error?: string;
}

export default async function tool(input: Input): Promise<ToolResult> {
  const settings = getSettings();
  const parsed = parseInput(input.url);

  if (parsed.url === undefined) {
    return {
      source: input.url,
      hops: [],
      redirectCount: 0,
      outcome: "invalid",
      error: parsed.error ?? "Not a URL",
    };
  }

  const chain = await expandFully(parsed.url, settings.expandOptions);
  const destination = finalHop(chain);
  const clean =
    destination === undefined
      ? undefined
      : stripTrackingParams(destination.url, { aggressive: settings.aggressiveTracking });

  return {
    source: chain.source,
    hops: chain.hops.map((hop) => ({
      position: hop.index + 1,
      url: hop.url,
      reachedBy: hop.via,
      status: hop.status,
      trackingParameters: hop.trackingParams,
      error: hop.error,
    })),
    finalUrl: destination?.url,
    finalUrlWithoutTracking: clean !== undefined && clean.removed.length > 0 ? clean.url : undefined,
    destinationTitle: destination?.documentTitle,
    redirectCount: Math.max(0, chain.hops.length - 1),
    outcome: chain.status,
    ...(chain.message !== undefined ? { error: chain.message } : {}),
  };
}
