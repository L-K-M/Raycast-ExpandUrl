import type { Chain, Hop } from "./types";

/** Human-readable label for how a hop was reached. */
export function describeVia(hop: Hop): string {
  switch (hop.via) {
    case "start":
      return "Start";
    case "meta-refresh":
      return "Meta refresh";
    case "http":
      return hop.index > 0 ? "Redirect" : "Start";
  }
}

/** Short status label for a hop: `301`, `200 OK`, `timed out`, or `pending`. */
export function describeStatus(hop: Hop): string {
  if (hop.error !== undefined) return hop.error;
  if (hop.status === undefined) return "Not requested";
  const text = hop.statusText ?? "";
  return text.length > 0 ? `${hop.status} ${text}` : String(hop.status);
}

/** One-line summary of how a chain ended. */
export function describeChainStatus(chain: Chain): string {
  const count = chain.hops.length;
  const hops = `${count} ${count === 1 ? "hop" : "hops"}`;

  switch (chain.status) {
    case "idle":
      return "Not started";
    case "running":
      return `Expanding… (${hops})`;
    case "paused":
      return `${hops}, more to expand`;
    case "final":
      return count === 1 ? "No redirects" : `${hops}, resolved`;
    case "max-hops":
      return `${hops}, stopped at the hop limit`;
    case "loop":
      return `${hops}, redirect loop`;
    case "stopped":
      return `${hops}, stopped`;
    case "error":
      return `${hops}, failed`;
  }
}

/** The last hop that was actually requested and succeeded. */
export function finalHop(chain: Chain): Hop | undefined {
  for (let index = chain.hops.length - 1; index >= 0; index -= 1) {
    const hop = chain.hops[index];
    if (hop !== undefined && hop.error === undefined && hop.status !== undefined) {
      return hop;
    }
  }
  return chain.hops[0];
}

/** Total tracking parameters across the whole chain, counted once per hop. */
export function countTrackingParams(chain: Chain): number {
  return chain.hops.reduce((total, hop) => total + (hop.trackingParams?.length ?? 0), 0);
}

/**
 * The chain as a numbered plain-text list, suitable for pasting into a ticket.
 */
export function chainToText(chain: Chain): string {
  const lines = chain.hops.map((hop) => {
    const status = hop.status !== undefined || hop.error !== undefined ? ` [${describeStatus(hop)}]` : "";
    return `${hop.index + 1}. ${hop.url}${status}`;
  });
  return [...lines, "", describeChainStatus(chain)].join("\n");
}

/** The chain as a Markdown list with linked URLs. */
export function chainToMarkdown(chain: Chain): string {
  const lines = chain.hops.map((hop) => {
    const parts = [describeVia(hop)];
    if (hop.status !== undefined || hop.error !== undefined) {
      parts.push(describeStatus(hop));
    }
    return `${hop.index + 1}. <${hop.url}> — ${parts.join(" · ")}`;
  });

  const title = finalHop(chain)?.documentTitle;
  return [
    `**Redirect chain for** <${chain.source}>`,
    "",
    ...lines,
    "",
    ...(title !== undefined ? [`**Destination title:** ${title}`, ""] : []),
    `_${describeChainStatus(chain)}_`,
  ].join("\n");
}
