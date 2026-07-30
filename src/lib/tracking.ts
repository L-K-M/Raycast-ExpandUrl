/**
 * Classification and removal of tracking query parameters.
 *
 * Two tiers, because aggressiveness has a real cost. Stripping `utm_source`
 * never breaks a link. Stripping `?s=` breaks Stack Exchange search, and `?ref=`
 * is a routing parameter on plenty of sites. So the unambiguous trackers are
 * removed by default and the contextual ones are opt-in.
 */

/** Unambiguous trackers: removing these never changes what a URL resolves to. */
const CONSERVATIVE_EXACT = new Set([
  "dclid",
  "fbclid",
  "gbraid",
  "gclid",
  "gclsrc",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "msclkid",
  "_hsenc",
  "_hsmi",
  "_openstat",
  "__s",
  "twclid",
  "vero_conv",
  "vero_id",
  "wbraid",
  "wickedid",
  "yclid",
  "vmcid",
  "ysclid",
]);

const CONSERVATIVE_PREFIXES = ["utm_", "oly_", "at_custom", "pk_", "piwik_", "matomo_", "hsa_"];

/**
 * Contextual parameters. Frequently tracking, but sometimes load-bearing —
 * hence opt-in.
 */
const AGGRESSIVE_EXACT = new Set([
  "cmpid",
  "ref",
  "referrer",
  "ref_src",
  "ref_url",
  "s",
  "si",
  "source",
  "spm",
  "trk",
  "trkCampaign",
  "cid",
  "campaign",
]);

export interface StripOptions {
  /** Also remove the contextual tier. */
  aggressive?: boolean;
}

export function isTrackingParam(name: string, options: StripOptions = {}): boolean {
  const lower = name.toLowerCase();
  if (CONSERVATIVE_EXACT.has(lower)) return true;
  if (CONSERVATIVE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  if (options.aggressive === true && AGGRESSIVE_EXACT.has(lower)) return true;
  return false;
}

/** Names of the tracking parameters present on a URL, in the order they appear. */
export function findTrackingParams(url: URL, options: StripOptions = {}): string[] {
  const found: string[] = [];
  for (const name of url.searchParams.keys()) {
    if (isTrackingParam(name, options) && !found.includes(name)) {
      found.push(name);
    }
  }
  return found;
}

export interface StripResult {
  url: string;
  removed: string[];
}

/**
 * Removes tracking parameters, preserving the order of everything kept.
 *
 * Returns the input string untouched when there is nothing to remove, so a URL
 * never gets silently re-encoded (`%7E` → `~` and friends) just by passing
 * through here.
 */
export function stripTrackingParams(input: string | URL, options: StripOptions = {}): StripResult {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    return { url: String(input), removed: [] };
  }

  const removed = findTrackingParams(url, options);
  if (removed.length === 0) {
    return { url: input instanceof URL ? input.href : input, removed: [] };
  }

  for (const name of removed) {
    url.searchParams.delete(name);
  }

  // An emptied query leaves a bare "?" behind, which is ugly and pointless.
  if (url.searchParams.size === 0) {
    url.search = "";
  }

  return { url: url.href, removed };
}
