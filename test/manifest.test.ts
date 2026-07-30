import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

/**
 * The project ships under the Unlicense, but `ray lint` hard-requires
 * `"license": "MIT"`, so it runs in `--relaxed` mode. That flag also switches
 * off validation of the package.json schema, the extension icons and the store
 * metadata. These tests re-implement the parts of those checks we actually
 * depend on, so relaxing the linter does not silently relax our guarantees.
 *
 * See AGENTS.md for the full rationale.
 */

interface Command {
  name: string;
  title: string;
  description: string;
  mode: string;
  subtitle?: string;
  arguments?: { name: string; type: string; placeholder: string; required?: boolean }[];
}

interface Manifest {
  name: string;
  title: string;
  description: string;
  icon: string;
  author: string;
  license: string;
  platforms: string[];
  categories: string[];
  commands: Command[];
  tools?: { name: string; title: string; description: string }[];
}

/** https://developers.raycast.com/basics/prepare-an-extension-for-store */
const VALID_CATEGORIES = new Set([
  "Applications",
  "Communication",
  "Data",
  "Documentation",
  "Design Tools",
  "Developer Tools",
  "Finance",
  "Fun",
  "Media",
  "News",
  "Productivity",
  "Security",
  "System",
  "Web",
  "Other",
]);

const VALID_PLATFORMS = new Set(["macOS", "Windows"]);
const VALID_MODES = new Set(["view", "no-view", "menu-bar"]);
const VALID_ARGUMENT_TYPES = new Set(["text", "password", "dropdown"]);

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Manifest;
}

/**
 * Raycast resolves a command called `foo` to `src/foo.{ts,tsx,js,jsx}`, and a
 * tool called `bar` to `src/tools/bar.*`.
 */
function resolveEntryPoint(dir: string, name: string): string | undefined {
  return [".ts", ".tsx", ".js", ".jsx"]
    .map((ext) => path.join(root, dir, `${name}${ext}`))
    .find((candidate) => existsSync(candidate));
}

/** Reads width/height straight out of the PNG IHDR chunk. */
function readPngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error(`${file} is not a PNG`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("extension manifest", () => {
  it("uses a store-compatible extension name", async () => {
    const { name } = await readManifest();
    // The name becomes part of the Store URL, so it must be lowercase and
    // URL-safe.
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("declares an author, a description and a license", async () => {
    const manifest = await readManifest();
    expect(manifest.author.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.license.length).toBeGreaterThan(0);
  });

  it("declares only known categories, and at least one", async () => {
    const { categories } = await readManifest();
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(VALID_CATEGORIES, `unknown category "${category}"`).toContain(category);
    }
  });

  it("declares only known platforms", async () => {
    const { platforms } = await readManifest();
    expect(platforms.length).toBeGreaterThan(0);
    for (const platform of platforms) {
      expect(VALID_PLATFORMS, `unknown platform "${platform}"`).toContain(platform);
    }
  });

  it("declares at least one command", async () => {
    const { commands } = await readManifest();
    expect(commands.length).toBeGreaterThan(0);
  });

  it("has an entry point on disk for every command", async () => {
    const { commands } = await readManifest();
    for (const command of commands) {
      expect(
        resolveEntryPoint("src", command.name),
        `missing src entry point for command "${command.name}"`,
      ).toBeDefined();
    }
  });

  it("has an entry point on disk for every tool", async () => {
    const manifest = await readManifest();
    for (const tool of manifest.tools ?? []) {
      expect(
        resolveEntryPoint("src/tools", tool.name),
        `missing src/tools entry point for tool "${tool.name}"`,
      ).toBeDefined();
    }
  });

  it("gives every command a title, a description and a valid mode", async () => {
    const { commands } = await readManifest();
    for (const command of commands) {
      expect(command.title.length, `command "${command.name}" needs a title`).toBeGreaterThan(0);
      expect(command.description.length, `command "${command.name}" needs a description`).toBeGreaterThan(0);
      expect(VALID_MODES, `command "${command.name}" has mode "${command.mode}"`).toContain(command.mode);
    }
  });

  it("does not give a command a subtitle that just repeats its title", async () => {
    // Store guideline: omit the subtitle when it adds nothing over the title.
    const { commands } = await readManifest();
    for (const command of commands) {
      expect(command.subtitle, `command "${command.name}" repeats its title as a subtitle`).not.toBe(command.title);
    }
  });

  it("declares well-formed command arguments", async () => {
    const { commands } = await readManifest();
    for (const command of commands) {
      for (const argument of command.arguments ?? []) {
        expect(argument.name.length).toBeGreaterThan(0);
        expect(argument.placeholder.length, `argument "${argument.name}" needs a placeholder`).toBeGreaterThan(0);
        expect(VALID_ARGUMENT_TYPES, `argument "${argument.name}" has type "${argument.type}"`).toContain(
          argument.type,
        );
      }
    }
  });

  it("ships a 512x512 PNG icon matching the manifest", async () => {
    const { icon } = await readManifest();
    const iconPath = path.join(root, "assets", icon);
    expect(existsSync(iconPath), `assets/${icon} is missing`).toBe(true);
    expect(readPngSize(iconPath)).toEqual({ width: 512, height: 512 });
  });
});
