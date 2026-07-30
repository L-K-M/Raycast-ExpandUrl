import { DEFAULT_EXPAND_OPTIONS, type ExpandOptions } from "./types";

/**
 * Turning raw preference values into options the engine can use.
 *
 * Pure and Raycast-free on purpose: Raycast text fields are free-form strings,
 * so "abc", "-5" and "999999" are all things a user can genuinely end up with,
 * and that validation is worth testing without a Raycast runtime in the way.
 */

export type ExpansionMode = "full" | "step";

/** The subset of the manifest's preferences this module reads. */
export interface RawPreferences {
  expansionMode?: string;
  autoExpandOnLaunch?: boolean;
  readClipboard?: boolean;
  followMetaRefresh?: boolean;
  blockPrivateHosts?: boolean;
  stripAggressively?: boolean;
  keepHistory?: boolean;
  userAgent?: string;
  maxHops?: string;
  timeoutSeconds?: string;
}

export interface Settings {
  mode: ExpansionMode;
  autoExpandOnLaunch: boolean;
  readClipboard: boolean;
  keepHistory: boolean;
  aggressiveTracking: boolean;
  expandOptions: ExpandOptions;
  /** Preferences that were unusable, and what was used instead. */
  warnings: string[];
}

/**
 * User agents offered in preferences.
 *
 * A browser string is the default because it is what actually works:
 * shorteners and CDNs routinely answer an unrecognised agent with 403, so the
 * honest default would also be the broken one. The honest option is offered for
 * anyone who would rather be refused than misrepresented.
 */
export const USER_AGENTS: Record<string, string> = {
  chrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  raycast: "Raycast Expand URL (+https://github.com/L-K-M/Raycast-ExpandUrl)",
};

export const LIMITS = {
  maxHops: { min: 1, max: 100, fallback: 20 },
  timeoutSeconds: { min: 1, max: 120, fallback: 10 },
} as const;

interface NumberSpec {
  label: string;
  fallback: number;
  min: number;
  max: number;
}

function readNumber(raw: string | undefined, spec: NumberSpec, warnings: string[]): number {
  if (raw === undefined || raw.trim().length === 0) return spec.fallback;

  const value = Number(raw.trim());
  if (!Number.isFinite(value)) {
    warnings.push(`${spec.label} is not a number, using ${spec.fallback}`);
    return spec.fallback;
  }

  const rounded = Math.round(value);
  const clamped = Math.min(spec.max, Math.max(spec.min, rounded));
  if (clamped !== rounded) {
    warnings.push(`${spec.label} must be between ${spec.min} and ${spec.max}, using ${clamped}`);
  }
  return clamped;
}

/**
 * Returns the value Raycast supplied, including an explicit `false`, and falls
 * back to the documented default only when the preference is `undefined` --
 * which is what a preference Raycast has not populated yet looks like. Without
 * the fallback those silently read as off.
 */
function readBoolean(raw: boolean | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw;
}

export function resolveSettings(raw: RawPreferences): Settings {
  const warnings: string[] = [];

  const maxHops = readNumber(raw.maxHops, { label: "Maximum hops", ...LIMITS.maxHops }, warnings);
  const timeoutSeconds = readNumber(
    raw.timeoutSeconds,
    { label: "Request timeout", ...LIMITS.timeoutSeconds },
    warnings,
  );
  const aggressiveTracking = readBoolean(raw.stripAggressively, false);

  return {
    mode: raw.expansionMode === "step" ? "step" : "full",
    autoExpandOnLaunch: readBoolean(raw.autoExpandOnLaunch, true),
    readClipboard: readBoolean(raw.readClipboard, true),
    keepHistory: readBoolean(raw.keepHistory, true),
    aggressiveTracking,
    warnings,
    expandOptions: {
      ...DEFAULT_EXPAND_OPTIONS,
      maxHops,
      timeoutMs: timeoutSeconds * 1000,
      userAgent: USER_AGENTS[raw.userAgent ?? "chrome"] ?? DEFAULT_EXPAND_OPTIONS.userAgent,
      followMetaRefresh: readBoolean(raw.followMetaRefresh, true),
      blockPrivateHosts: readBoolean(raw.blockPrivateHosts, true),
      aggressiveTracking,
    },
  };
}
