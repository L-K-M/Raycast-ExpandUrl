import { describe, expect, it } from "vitest";
import { pickSeedText } from "../src/lib/launch";

/**
 * The bug this guards against shipped once, in the same pull request that
 * documented the feature it broke.
 *
 * `props.arguments.url ?? props.fallbackText` looks correct and is not: Raycast
 * types an optional argument as `string` and supplies `""` for it, so `??`
 * keeps the empty string and `fallbackText` is never read. Registering
 * `Expand URL` as a fallback command would have opened an empty explorer.
 */
describe("pickSeedText", () => {
  it("prefers the first candidate with content", () => {
    expect(pickSeedText("https://a/", "https://b/")).toBe("https://a/");
  });

  it("falls through an empty-string argument, which is what ?? got wrong", () => {
    expect(pickSeedText("", "https://fallback/")).toBe("https://fallback/");
  });

  it("falls through a whitespace-only argument", () => {
    expect(pickSeedText("   ", "https://fallback/")).toBe("https://fallback/");
  });

  it("falls through undefined and null", () => {
    expect(pickSeedText(undefined, "https://fallback/")).toBe("https://fallback/");
    expect(pickSeedText(null, "https://fallback/")).toBe("https://fallback/");
  });

  it("returns undefined when nothing has content", () => {
    expect(pickSeedText()).toBeUndefined();
    expect(pickSeedText("", "   ", undefined, null)).toBeUndefined();
  });

  it("trims what it returns", () => {
    expect(pickSeedText("  https://a/  ")).toBe("https://a/");
  });

  it("keeps looking past several empty candidates", () => {
    expect(pickSeedText("", undefined, "  ", "https://c/")).toBe("https://c/");
  });
});
