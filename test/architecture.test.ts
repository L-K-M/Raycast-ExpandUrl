import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

async function sourceFilesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFilesUnder(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

/**
 * The rule that makes the expansion engine testable at all.
 *
 * If anything under src/lib reaches for @raycast/api, the whole suite suddenly
 * needs a Raycast runtime — which does not exist on the Linux box CI runs on.
 * The invariant is stated in AGENTS.md; this is what actually holds it.
 */
describe("src/lib is Raycast-free", () => {
  it("has source files to check", async () => {
    const files = await sourceFilesUnder(path.join(root, "src", "lib"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports nothing from @raycast anywhere", async () => {
    const files = await sourceFilesUnder(path.join(root, "src", "lib"));
    const offenders: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      // Catches `import ... from "@raycast/..."`, `require("@raycast/...")` and
      // dynamic `import("@raycast/...")` alike.
      if (/["']@raycast\//.test(source)) {
        offenders.push(path.relative(root, file));
      }
    }

    expect(offenders, `these files must not depend on the Raycast runtime: ${offenders.join(", ")}`).toEqual([]);
  });

  it("keeps preference reading in exactly one place", async () => {
    // getPreferenceValues() is the seam between Raycast and the pure code.
    // Scattering it makes settings untestable and inconsistent.
    const files = await sourceFilesUnder(path.join(root, "src"));
    const callers: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (source.includes("getPreferenceValues")) {
        callers.push(path.relative(root, file));
      }
    }

    expect(callers).toEqual(["src/preferences.ts"]);
  });
});

/**
 * The README is the only place a user learns what a preference does, and it is
 * the first thing to go stale when one is added. This caught `keepHistory`
 * shipping undocumented.
 */
describe("documentation keeps up with the manifest", () => {
  it("documents every preference in the README", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      preferences: { name: string; title: string }[];
    };
    const readme = await readFile(path.join(root, "README.md"), "utf8");

    const undocumented = manifest.preferences
      .filter((preference) => !readme.includes(preference.title))
      .map((preference) => `${preference.name} ("${preference.title}")`);

    expect(undocumented, `undocumented preferences: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("documents every command in the README", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      commands: { name: string; title: string }[];
    };
    const readme = await readFile(path.join(root, "README.md"), "utf8");

    const undocumented = manifest.commands
      .filter((command) => !readme.includes(command.title))
      .map((command) => command.name);

    expect(undocumented, `undocumented commands: ${undocumented.join(", ")}`).toEqual([]);
  });
});

/**
 * The design commitment in PLAN.md §1 is that the extension never collapses a
 * chain to its destination. That was violated once already: the clipboard
 * command shipped as `no-view`, expanding fully and copying the last URL — and
 * because it was the command reachable by name from root search, the one thing
 * the extension exists to avoid became the path most users would take.
 */
describe("no command collapses the chain", () => {
  it("declares every command as a view", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      commands: { name: string; mode: string }[];
    };

    const headless = manifest.commands.filter((command) => command.mode !== "view").map((command) => command.name);

    expect(
      headless,
      `these commands cannot show a chain: ${headless.join(", ")}. A no-view command can only ` +
        "report a destination, which is the behaviour PLAN.md rules out.",
    ).toEqual([]);
  });

  it("routes every command through the shared chain explorer", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      commands: { name: string }[];
    };

    for (const { name } of manifest.commands) {
      // Resolved rather than assumed, so renaming a command fails this
      // assertion with a useful message instead of throwing ENOENT.
      const entry = [".tsx", ".ts", ".jsx", ".js"]
        .map((extension) => path.join(root, "src", `${name}${extension}`))
        .find((candidate) => existsSync(candidate));

      expect(entry, `no entry point on disk for command "${name}"`).toBeDefined();
      const source = await readFile(entry as string, "utf8");
      // Match the JSX tag, not the identifier: `toContain("ChainExplorer")`
      // is satisfied by the import alone, so removing the render and leaving a
      // stale import would have passed.
      expect(source, `${name} should render <ChainExplorer />`).toMatch(/<ChainExplorer[\s/>]/);
    }
  });
});
