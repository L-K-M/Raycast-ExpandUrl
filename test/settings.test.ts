import { describe, expect, it } from "vitest";
import { resolveSettings, USER_AGENTS } from "../src/lib/settings";
import { DEFAULT_EXPAND_OPTIONS } from "../src/lib/types";

describe("resolveSettings", () => {
  it("uses documented defaults for an empty preference set", () => {
    const settings = resolveSettings({});
    expect(settings.mode).toBe("full");
    expect(settings.autoExpandOnLaunch).toBe(true);
    expect(settings.readClipboard).toBe(true);
    expect(settings.keepHistory).toBe(true);
    expect(settings.aggressiveTracking).toBe(false);
    expect(settings.expandOptions.maxHops).toBe(20);
    expect(settings.expandOptions.timeoutMs).toBe(10_000);
    expect(settings.expandOptions.followMetaRefresh).toBe(true);
    expect(settings.expandOptions.blockPrivateHosts).toBe(true);
    expect(settings.warnings).toEqual([]);
  });

  it("reads an explicit false rather than falling back to the default", () => {
    const settings = resolveSettings({
      autoExpandOnLaunch: false,
      readClipboard: false,
      followMetaRefresh: false,
      blockPrivateHosts: false,
      keepHistory: false,
    });
    expect(settings.autoExpandOnLaunch).toBe(false);
    expect(settings.readClipboard).toBe(false);
    expect(settings.keepHistory).toBe(false);
    expect(settings.expandOptions.followMetaRefresh).toBe(false);
    expect(settings.expandOptions.blockPrivateHosts).toBe(false);
  });

  it("selects step mode", () => {
    expect(resolveSettings({ expansionMode: "step" }).mode).toBe("step");
  });

  it("falls back to full mode for an unrecognised value", () => {
    expect(resolveSettings({ expansionMode: "sideways" }).mode).toBe("full");
  });

  it("propagates aggressive tracking into the engine options", () => {
    const settings = resolveSettings({ stripAggressively: true });
    expect(settings.aggressiveTracking).toBe(true);
    expect(settings.expandOptions.aggressiveTracking).toBe(true);
  });

  describe("user agent", () => {
    it.each(["chrome", "safari", "raycast"])("resolves the %s option", (key) => {
      expect(resolveSettings({ userAgent: key }).expandOptions.userAgent).toBe(USER_AGENTS[key]);
    });

    it("falls back to the default for an unknown option", () => {
      expect(resolveSettings({ userAgent: "netscape" }).expandOptions.userAgent).toBe(DEFAULT_EXPAND_OPTIONS.userAgent);
    });

    it("offers an honest agent that does not claim to be a browser", () => {
      expect(USER_AGENTS.raycast).not.toMatch(/Mozilla/);
    });
  });

  describe("numeric preferences", () => {
    it("accepts valid values", () => {
      const settings = resolveSettings({ maxHops: "5", timeoutSeconds: "30" });
      expect(settings.expandOptions.maxHops).toBe(5);
      expect(settings.expandOptions.timeoutMs).toBe(30_000);
      expect(settings.warnings).toEqual([]);
    });

    it("tolerates surrounding whitespace", () => {
      expect(resolveSettings({ maxHops: "  7 " }).expandOptions.maxHops).toBe(7);
    });

    it("falls back on an empty string", () => {
      const settings = resolveSettings({ maxHops: "", timeoutSeconds: "   " });
      expect(settings.expandOptions.maxHops).toBe(20);
      expect(settings.expandOptions.timeoutMs).toBe(10_000);
      expect(settings.warnings).toEqual([]);
    });

    it.each(["abc", "12abc", "NaN", "--3"])("falls back and warns for the unparseable value %s", (value) => {
      const settings = resolveSettings({ maxHops: value });
      expect(settings.expandOptions.maxHops).toBe(20);
      expect(settings.warnings).toHaveLength(1);
      expect(settings.warnings[0]).toMatch(/not a number/);
    });

    it("clamps below the minimum and warns", () => {
      const settings = resolveSettings({ maxHops: "0" });
      expect(settings.expandOptions.maxHops).toBe(1);
      expect(settings.warnings[0]).toMatch(/between 1 and 100/);
    });

    it("clamps a negative value and warns", () => {
      expect(resolveSettings({ maxHops: "-5" }).expandOptions.maxHops).toBe(1);
    });

    it("clamps above the maximum and warns", () => {
      const settings = resolveSettings({ maxHops: "100000" });
      expect(settings.expandOptions.maxHops).toBe(100);
      expect(settings.warnings[0]).toMatch(/between 1 and 100/);
    });

    it("rounds a fractional value without warning", () => {
      const settings = resolveSettings({ maxHops: "7.4" });
      expect(settings.expandOptions.maxHops).toBe(7);
      expect(settings.warnings).toEqual([]);
    });

    it("rejects Infinity rather than expanding forever", () => {
      const settings = resolveSettings({ maxHops: "Infinity" });
      expect(settings.expandOptions.maxHops).toBe(20);
      expect(settings.warnings[0]).toMatch(/not a number/);
    });

    it("clamps the timeout to its own range", () => {
      expect(resolveSettings({ timeoutSeconds: "9999" }).expandOptions.timeoutMs).toBe(120_000);
      expect(resolveSettings({ timeoutSeconds: "0" }).expandOptions.timeoutMs).toBe(1_000);
    });

    it("reports one warning per bad preference", () => {
      const settings = resolveSettings({ maxHops: "0", timeoutSeconds: "9999" });
      expect(settings.warnings).toHaveLength(2);
    });
  });
});
