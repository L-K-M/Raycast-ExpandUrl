/**
 * Turning whatever the user had in their clipboard into a URL we can request.
 */

/** Characters that commonly trail a URL in prose but are rarely part of it. */
const TRAILING_PUNCTUATION = /[.,;:!?'"”’]+$/;

/** Closing brackets, paired with their opener so we only strip unbalanced ones. */
const CLOSING_BRACKETS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
  ">": "<",
};

/**
 * Trims punctuation that a sentence left on the end of a URL.
 *
 * Brackets need care: `…/Foo_(disambiguation)` is a real Wikipedia URL, but
 * `(see https://example.com/x)` is a URL inside parentheses. Strip a closing
 * bracket only when the URL contains no matching opener.
 */
export function trimUrlPunctuation(candidate: string): string {
  let result = candidate;

  for (;;) {
    const before = result;

    result = result.replace(TRAILING_PUNCTUATION, "");

    const last = result.at(-1);
    if (last !== undefined && last in CLOSING_BRACKETS) {
      const opener = CLOSING_BRACKETS[last] as string;
      const openCount = result.split(opener).length - 1;
      const closeCount = result.split(last).length - 1;
      if (closeCount > openCount) {
        result = result.slice(0, -1);
      }
    }

    if (result === before) {
      return result;
    }
  }
}

/** Matches an explicit http(s) URL anywhere in a block of text. */
const EXPLICIT_URL = /https?:\/\/[^\s<>"'`]+/i;

/**
 * Matches a scheme-less host that is worth trying with https:// in front, e.g.
 * `bit.ly/abc`. Requires a dot and a plausible TLD so ordinary prose does not
 * get treated as a host.
 */
const BARE_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?:[:/?#]\S*)?$/i;

/**
 * Final segments that mean "this is a filename", not "this is a host", so
 * `notes.txt` does not become a DNS lookup for `notes.txt`.
 *
 * Deliberately conservative: it lists only segments that are *not* real TLDs.
 * `.zip`, `.mov`, `.sh`, `.md`, `.so` and `.pl` all look like file extensions
 * and are all delegated TLDs, so they are absent here and will be treated as
 * hosts. Guessing wrong in that direction merely costs a failed lookup;
 * guessing wrong the other way would refuse a URL that works.
 */
const FILE_EXTENSIONS = new Set([
  "txt",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "html",
  "htm",
  "xml",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "lock",
  "bak",
  "tmp",
  "csv",
  "tsv",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "rtf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "mp3",
  "mp4",
  "wav",
  "avi",
  "mkv",
  "gz",
  "bz2",
  "xz",
  "rar",
  "iso",
  "exe",
  "dmg",
  "deb",
  "rpm",
  "bin",
  "dll",
  "jar",
  "war",
]);

/** True when a scheme-less token looks more like a filename than a hostname. */
function looksLikeFilename(candidate: string): boolean {
  // Only applies when there is no path, query or port to disambiguate:
  // `notes.txt` is a filename, but `notes.txt/x` is somebody's odd URL.
  if (/[:/?#]/.test(candidate)) return false;
  const extension = candidate.split(".").at(-1)?.toLowerCase();
  return extension !== undefined && FILE_EXTENSIONS.has(extension);
}

export interface ParsedInput {
  url?: URL;
  error?: string;
}

/**
 * Extracts a URL from arbitrary text.
 *
 * Accepts a bare URL, a URL embedded in a sentence, or a scheme-less host such
 * as `bit.ly/abc`. Anything else is reported as an error rather than guessed
 * at, because guessing here means firing a network request at something the
 * user did not intend.
 */
export function parseInput(text: string): ParsedInput {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { error: "Enter a URL to expand" };
  }

  const explicit = EXPLICIT_URL.exec(trimmed);
  const candidate =
    explicit !== null
      ? trimUrlPunctuation(explicit[0])
      : BARE_HOST.test(trimmed) && !looksLikeFilename(trimmed)
        ? `https://${trimUrlPunctuation(trimmed)}`
        : undefined;

  if (candidate === undefined) {
    // `file:///etc/passwd` is a URL, just not one we can expand. Saying so
    // beats "that does not look like a URL", which is both wrong and unhelpful.
    // The negative lookahead keeps `localhost:8080/x` from reading as a scheme.
    const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(trimmed)?.[1]?.toLowerCase();
    if (scheme !== undefined && scheme !== "http" && scheme !== "https") {
      return { error: `Only http and https URLs can be expanded, not ${scheme}:` };
    }
    return { error: "That does not look like a URL" };
  }

  try {
    const url = new URL(candidate);
    if (url.hostname.length === 0) {
      return { error: "That URL has no host" };
    }
    return { url };
  } catch {
    return { error: "That does not look like a URL" };
  }
}

/**
 * Resolves a `Location` header against the URL it came from.
 *
 * Servers send relative redirects (`/next`, `../up`, `//other.example`) far
 * more often than the RFC's original absolute-only rule suggests.
 */
export function resolveLocation(location: string, base: URL): URL | undefined {
  try {
    return new URL(location.trim(), base);
  } catch {
    return undefined;
  }
}

/**
 * Key used for loop detection.
 *
 * Deliberately the full normalised URL: a chain that bounces between
 * `/a?x=1` and `/a?x=2` is not a loop, and collapsing the query would
 * misreport it as one.
 */
export function loopKey(url: URL): string {
  return url.href;
}

/** Host shown in compact UI, with a leading `www.` dropped. */
export function displayHost(url: URL): string {
  return url.hostname.replace(/^www\./i, "");
}
