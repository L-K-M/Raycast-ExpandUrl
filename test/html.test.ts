import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  findDocumentTitle,
  findMetaRefresh,
  isHtmlContentType,
  parseRefreshContent,
} from "../src/lib/html";

describe("parseRefreshContent", () => {
  it("parses the ordinary form", () => {
    expect(parseRefreshContent("0; url=https://example.com/")).toEqual({
      delaySeconds: 0,
      target: "https://example.com/",
    });
  });

  it.each([
    ["uppercase URL=", "0; URL=https://example.com/"],
    ["no space after the semicolon", "0;url=https://example.com/"],
    ["extra whitespace", "  0 ;  url  =  https://example.com/  "],
    ["double-quoted target", `0; url="https://example.com/"`],
    ["single-quoted target", "0; url='https://example.com/'"],
  ])("tolerates %s", (_label, content) => {
    expect(parseRefreshContent(content)?.target).toBe("https://example.com/");
  });

  it("keeps a non-zero delay", () => {
    expect(parseRefreshContent("10; url=https://example.com/")?.delaySeconds).toBe(10);
  });

  it("parses a fractional delay", () => {
    expect(parseRefreshContent("2.5; url=https://example.com/")?.delaySeconds).toBe(2.5);
  });

  it("returns undefined for a delay-only refresh, which is not a redirect", () => {
    expect(parseRefreshContent("30")).toBeUndefined();
  });

  it("returns undefined for empty or targetless content", () => {
    expect(parseRefreshContent("")).toBeUndefined();
    expect(parseRefreshContent("0;")).toBeUndefined();
    expect(parseRefreshContent("0; url=")).toBeUndefined();
  });

  it("keeps a relative target for the caller to resolve", () => {
    expect(parseRefreshContent("0; url=/next")?.target).toBe("/next");
  });

  it("does not truncate a target containing an equals sign", () => {
    expect(parseRefreshContent("0; url=/next?a=1&b=2")?.target).toBe("/next?a=1&b=2");
  });
});

describe("findMetaRefresh", () => {
  it("finds a refresh in a normal document", () => {
    const html = `<html><head><meta http-equiv="refresh" content="0; url=/next"></head></html>`;
    expect(findMetaRefresh(html)?.target).toBe("/next");
  });

  it.each([
    ["single-quoted attributes", `<meta http-equiv='refresh' content='0; url=/next'>`],
    ["unquoted attributes", `<meta http-equiv=refresh content=0;url=/next>`],
    ["uppercase tag and attributes", `<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=/next">`],
    ["attributes in the other order", `<meta content="0; url=/next" http-equiv="refresh">`],
    ["a self-closing tag", `<meta http-equiv="refresh" content="0; url=/next" />`],
  ])("handles %s", (_label, html) => {
    expect(findMetaRefresh(html)?.target).toBe("/next");
  });

  it("ignores meta tags that are not refreshes", () => {
    const html = `<meta charset="utf-8"><meta name="description" content="0; url=/nope">`;
    expect(findMetaRefresh(html)).toBeUndefined();
  });

  it("skips a malformed refresh and takes the next usable one", () => {
    const html = `<meta http-equiv="refresh" content="30"><meta http-equiv="refresh" content="0; url=/next">`;
    expect(findMetaRefresh(html)?.target).toBe("/next");
  });

  /**
   * `\b` treats `-` as a boundary, so `\bcontent` matched inside `data-content`.
   * Because the regex takes the first match in the tag, the second case here
   * returned "junk" and the real redirect was lost entirely.
   */
  it("does not mistake data-http-equiv for http-equiv", () => {
    expect(findMetaRefresh(`<meta data-http-equiv="refresh" content="0; url=/evil">`)).toBeUndefined();
  });

  it("reads the real content attribute, not a data-content that precedes it", () => {
    const html = `<meta http-equiv="refresh" data-content="junk" content="0; url=/next">`;
    expect(findMetaRefresh(html)?.target).toBe("/next");
  });

  it("returns undefined when there is no refresh at all", () => {
    expect(findMetaRefresh("<html><body>nothing here</body></html>")).toBeUndefined();
  });

  it("returns undefined on a truncated tag", () => {
    // A body cut off at the read cap can end mid-tag.
    expect(findMetaRefresh(`<html><head><meta http-equiv="refresh" cont`)).toBeUndefined();
  });
});

describe("decodeEntities", () => {
  it.each([
    ["&amp;", "&"],
    ["&lt;&gt;", "<>"],
    ["&quot;", '"'],
    ["&eacute;", "é"],
    ["&mdash;", "—"],
    ["&hellip;", "…"],
    ["&rsquo;", "’"],
  ])("decodes the named entity %s", (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });

  it("decodes decimal and hexadecimal entities", () => {
    expect(decodeEntities("&#39;")).toBe("'");
    expect(decodeEntities("&#233;")).toBe("é");
    expect(decodeEntities("&#x27;")).toBe("'");
    expect(decodeEntities("&#xE9;")).toBe("é");
  });

  it("decodes an astral-plane codepoint", () => {
    expect(decodeEntities("&#128512;")).toBe("😀");
  });

  it("leaves unknown entities as written rather than mangling them", () => {
    expect(decodeEntities("&notarealentity;")).toBe("&notarealentity;");
  });

  it("leaves an out-of-range codepoint alone", () => {
    expect(decodeEntities("&#1114112;")).toBe("&#1114112;");
  });

  it("leaves a bare ampersand alone", () => {
    expect(decodeEntities("Tom & Jerry")).toBe("Tom & Jerry");
  });
});

describe("findDocumentTitle", () => {
  it("extracts a title", () => {
    expect(findDocumentTitle("<html><head><title>Hello</title></head></html>")).toBe("Hello");
  });

  it("decodes entities in the title", () => {
    expect(findDocumentTitle("<title>Caf&eacute; &amp; Bar</title>")).toBe("Café & Bar");
  });

  it("collapses whitespace and newlines", () => {
    expect(findDocumentTitle("<title>\n  Hello   there\n</title>")).toBe("Hello there");
  });

  it("handles attributes on the title tag", () => {
    expect(findDocumentTitle(`<title data-x="1">Hello</title>`)).toBe("Hello");
  });

  it("returns undefined for a missing, empty or unclosed title", () => {
    expect(findDocumentTitle("<html><body>x</body></html>")).toBeUndefined();
    expect(findDocumentTitle("<title></title>")).toBeUndefined();
    expect(findDocumentTitle("<title>   </title>")).toBeUndefined();
    expect(findDocumentTitle("<title>truncated at the read cap")).toBeUndefined();
  });
});

describe("isHtmlContentType", () => {
  it.each(["text/html", "text/html; charset=utf-8", "TEXT/HTML", " text/html ", "application/xhtml+xml"])(
    "recognises %s as HTML",
    (value) => {
      expect(isHtmlContentType(value)).toBe(true);
    },
  );

  it.each(["application/json", "text/plain", "application/pdf", "image/png", undefined])(
    "does not treat %s as HTML",
    (value) => {
      expect(isHtmlContentType(value)).toBe(false);
    },
  );
});
