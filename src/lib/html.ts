/**
 * Just enough HTML reading to find a meta refresh and a document title.
 *
 * Deliberately regex-based rather than a parser dependency: the input is a
 * truncated 64 KiB prefix of a response that may not be valid HTML at all, and
 * we only need two specific tags out of the head. A real parser would be
 * heavier and no more correct on this input.
 */

const META_TAG = /<meta\b[^>]*>/gi;
const TITLE_TAG = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

/** Reads one attribute out of a tag, handling double, single and bare values. */
function attribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = pattern.exec(tag);
  if (match === null) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

export interface MetaRefresh {
  /** Seconds the browser would wait before navigating. */
  delaySeconds: number;
  /** The raw target, which may be relative. */
  target: string;
}

/**
 * Parses a `content` value of the form `5; url=https://example.com`.
 *
 * Tolerates the many spellings seen in the wild: no `url=` at all (delay-only
 * self-refresh, which is not a redirect), quoted targets, `URL=` in any case,
 * and whitespace anywhere.
 */
export function parseRefreshContent(content: string): MetaRefresh | undefined {
  const trimmed = content.trim();
  if (trimmed.length === 0) return undefined;

  const separator = trimmed.indexOf(";");
  const delayPart = separator === -1 ? trimmed : trimmed.slice(0, separator);
  const rest = separator === -1 ? "" : trimmed.slice(separator + 1);

  // A leading non-numeric value is malformed; treat a missing delay as 0.
  const delayMatch = /^\s*(\d+(?:\.\d+)?)/.exec(delayPart);
  const delaySeconds = delayMatch?.[1] !== undefined ? Number.parseFloat(delayMatch[1]) : 0;

  const urlMatch = /\burl\s*=\s*(.*)$/is.exec(rest);
  if (urlMatch?.[1] === undefined) return undefined;

  let target = urlMatch[1].trim();
  // Strip a matching pair of quotes around the target.
  const first = target.at(0);
  if ((first === '"' || first === "'") && target.at(-1) === first) {
    target = target.slice(1, -1).trim();
  }

  if (target.length === 0) return undefined;
  return { delaySeconds, target };
}

/** Finds the first usable `<meta http-equiv="refresh">` in a document. */
export function findMetaRefresh(html: string): MetaRefresh | undefined {
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0];
    if (attribute(tag, "http-equiv")?.trim().toLowerCase() !== "refresh") continue;

    const content = attribute(tag, "content");
    if (content === undefined) continue;

    const refresh = parseRefreshContent(content);
    if (refresh !== undefined) return refresh;
  }
  return undefined;
}

/**
 * Named entities common enough to appear in a page title.
 *
 * Not the full HTML5 set — that is over two thousand entries, nearly all of
 * them dead weight for `<title>` text. Numeric entities are handled
 * generically below, which covers everything omitted here.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  // Typography
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  laquo: "«",
  raquo: "»",
  // Symbols
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  dagger: "†",
  permil: "‰",
  times: "×",
  divide: "÷",
  plusmn: "±",
  frac12: "½",
  // Latin-1 letters
  aacute: "á",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  ntilde: "ñ",
  oacute: "ó",
  ograve: "ò",
  ocirc: "ô",
  ouml: "ö",
  oslash: "ø",
  uacute: "ú",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  szlig: "ß",
};

/** Decodes named and numeric entities. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? whole : safeFromCodePoint(code, whole);
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? whole : safeFromCodePoint(code, whole);
    }
    return NAMED_ENTITIES[lower] ?? whole;
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  if (code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Extracts and tidies the document title, if the prefix we read contains one. */
export function findDocumentTitle(html: string): string | undefined {
  const match = TITLE_TAG.exec(html);
  if (match?.[1] === undefined) return undefined;

  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : undefined;
}

/** True when a `content-type` names something we can usefully read as HTML. */
export function isHtmlContentType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const essence = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return essence === "text/html" || essence === "application/xhtml+xml";
}
