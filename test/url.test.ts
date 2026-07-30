import { describe, expect, it } from "vitest";
import { displayHost, loopKey, parseInput, resolveLocation, trimUrlPunctuation } from "../src/lib/url";

describe("parseInput", () => {
  it("accepts a plain URL", () => {
    expect(parseInput("https://example.com/a")?.url?.href).toBe("https://example.com/a");
  });

  it("trims surrounding whitespace", () => {
    expect(parseInput("  https://example.com/a\n ").url?.href).toBe("https://example.com/a");
  });

  it("accepts http as well as https", () => {
    expect(parseInput("http://example.com/").url?.href).toBe("http://example.com/");
  });

  it("pulls a URL out of surrounding prose", () => {
    expect(parseInput("look at https://example.com/a it is good").url?.href).toBe("https://example.com/a");
  });

  it("adds https:// to a bare host", () => {
    expect(parseInput("bit.ly/abc").url?.href).toBe("https://bit.ly/abc");
    expect(parseInput("example.com").url?.href).toBe("https://example.com/");
  });

  it("keeps query strings and fragments intact", () => {
    const url = parseInput("https://example.com/a?b=1&c=2#frag").url;
    expect(url?.search).toBe("?b=1&c=2");
    expect(url?.hash).toBe("#frag");
  });

  it("rejects empty input with a usable message", () => {
    expect(parseInput("").error).toBeDefined();
    expect(parseInput("   ").error).toBeDefined();
  });

  it("rejects text that is not a URL", () => {
    expect(parseInput("hello world").error).toBeDefined();
    expect(parseInput("just some words").error).toBeDefined();
  });

  it.each(["notes.txt", "data.json", "report.pdf", "photo.PNG", "index.html", "archive.tar.gz"])(
    "does not treat the filename %s as a host",
    (input) => {
      expect(parseInput(input).error).toBeDefined();
    },
  );

  it.each(["example.zip", "clip.mov", "script.sh", "recipe.md"])(
    "still accepts %s, because that is a real TLD",
    (input) => {
      // Refusing these would break working URLs; a failed lookup is the
      // cheaper mistake.
      expect(parseInput(input).url).toBeDefined();
    },
  );

  it("treats a filename-looking token with a path as a URL", () => {
    expect(parseInput("notes.txt/page").url?.href).toBe("https://notes.txt/page");
  });

  it("preserves a non-http scheme so the guard can report it properly", () => {
    // parseInput's job is parsing, not policy. checkUrl rejects the scheme, and
    // reporting "file: is not supported" beats "that is not a URL".
    expect(parseInput("file:///etc/passwd").error).toBeDefined();
  });
});

describe("filename detection", () => {
  it("recognises the image extensions it claims to", () => {
    // Guards against an entry being dropped while de-duplicating the list.
    for (const name of ["a.png", "a.jpg", "a.gif", "a.svg", "a.webp"]) {
      expect(parseInput(name).error, name).toBeDefined();
    }
  });
});

describe("trimUrlPunctuation", () => {
  it.each([
    ["https://example.com/a.", "https://example.com/a"],
    ["https://example.com/a,", "https://example.com/a"],
    ["https://example.com/a!?", "https://example.com/a"],
    ['https://example.com/a"', "https://example.com/a"],
  ])("strips trailing punctuation from %s", (input, expected) => {
    expect(trimUrlPunctuation(input)).toBe(expected);
  });

  it("strips an unbalanced closing bracket", () => {
    expect(trimUrlPunctuation("https://example.com/a)")).toBe("https://example.com/a");
  });

  it("keeps a balanced closing bracket, which is part of the URL", () => {
    // The classic case this protects: Wikipedia disambiguation URLs.
    expect(trimUrlPunctuation("https://en.wikipedia.org/wiki/Mercury_(planet)")).toBe(
      "https://en.wikipedia.org/wiki/Mercury_(planet)",
    );
  });

  it("handles a balanced bracket followed by a sentence period", () => {
    expect(trimUrlPunctuation("https://en.wikipedia.org/wiki/Mercury_(planet).")).toBe(
      "https://en.wikipedia.org/wiki/Mercury_(planet)",
    );
  });

  it("extracts a parenthesised URL from prose correctly", () => {
    expect(parseInput("(see https://example.com/a)").url?.href).toBe("https://example.com/a");
  });
});

describe("resolveLocation", () => {
  const base = new URL("https://example.com/dir/page?x=1");

  it.each([
    ["absolute", "https://other.example/z", "https://other.example/z"],
    ["root-relative", "/z", "https://example.com/z"],
    ["path-relative", "z", "https://example.com/dir/z"],
    ["parent-relative", "../z", "https://example.com/z"],
    ["protocol-relative", "//other.example/z", "https://other.example/z"],
    ["query-only", "?y=2", "https://example.com/dir/page?y=2"],
  ])("resolves a %s Location", (_label, location, expected) => {
    expect(resolveLocation(location, base)?.href).toBe(expected);
  });

  it("tolerates surrounding whitespace", () => {
    expect(resolveLocation("  /z\r\n", base)?.href).toBe("https://example.com/z");
  });

  it("returns undefined for something unparseable", () => {
    expect(resolveLocation("http://[not a url", base)).toBeUndefined();
  });
});

describe("loopKey", () => {
  it("distinguishes URLs that differ only in query", () => {
    // Bouncing between ?x=1 and ?x=2 is paging, not a loop.
    expect(loopKey(new URL("https://example.com/a?x=1"))).not.toBe(loopKey(new URL("https://example.com/a?x=2")));
  });

  it("treats equivalent spellings of the same URL as equal", () => {
    expect(loopKey(new URL("https://example.com"))).toBe(loopKey(new URL("https://example.com/")));
  });
});

describe("displayHost", () => {
  it("drops a leading www.", () => {
    expect(displayHost(new URL("https://www.example.com/a"))).toBe("example.com");
  });

  it("leaves other subdomains alone", () => {
    expect(displayHost(new URL("https://api.example.com/a"))).toBe("api.example.com");
    expect(displayHost(new URL("https://wwwx.example.com/a"))).toBe("wwwx.example.com");
  });
});
