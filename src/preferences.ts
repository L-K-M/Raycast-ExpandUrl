import { getPreferenceValues } from "@raycast/api";
import { resolveSettings, type RawPreferences, type Settings } from "./lib/settings";

export type { ExpansionMode, Settings } from "./lib/settings";

/**
 * The only place Raycast preferences are read.
 *
 * All the interpretation lives in `lib/settings.ts`, which is Raycast-free and
 * therefore testable; this is just the plumbing.
 *
 * Typed as the extension-level `Preferences` rather than a command-scoped
 * `Preferences.ExpandUrl`, because every preference this extension declares is
 * extension-level and all three entry points — both commands and the AI tool —
 * read the same set through here.
 */
export function getSettings(): Settings {
  return resolveSettings(getPreferenceValues<Preferences>() as RawPreferences);
}
