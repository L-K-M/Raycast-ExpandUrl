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
