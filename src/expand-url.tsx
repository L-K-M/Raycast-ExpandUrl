import { LaunchProps } from "@raycast/api";
import { ChainExplorer } from "./components/ChainExplorer";
import { pickSeedText } from "./lib/launch";

/**
 * The chain explorer, seeded from the command argument or from root search.
 *
 * `fallbackText` carries the root-search text when this command is invoked as a
 * Raycast fallback command, which is the only way an extension command can be
 * reached by pasting a URL into root search — Raycast matches commands by name,
 * and no manifest field can register a fallback. See the README.
 *
 * `pickSeedText` rather than `??`: Raycast supplies `""` for an argument the
 * user left blank, so `??` would keep the empty string and never reach
 * `fallbackText`. See `lib/launch.ts`.
 */
export default function Command(props: LaunchProps<{ arguments: Arguments.ExpandUrl }>) {
  return <ChainExplorer initialText={pickSeedText(props.arguments.url, props.fallbackText)} />;
}
