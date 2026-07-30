import { ChainExplorer } from "./components/ChainExplorer";

/**
 * Expand the clipboard URL, showing the chain.
 *
 * This was originally a `no-view` command that expanded to the destination and
 * copied it — which is precisely the behaviour this extension exists to avoid.
 * Because it is the command reachable by name from root search, it also became
 * the path most people would actually take, so the one-shot shortcut was
 * quietly the default experience. It now renders the same chain explorer as
 * `Expand URL`, differing only in that it reads the clipboard regardless of the
 * Clipboard preference: choosing to run *this* command is the explicit request
 * that the preference otherwise stands in for.
 */
export default function Command() {
  return <ChainExplorer alwaysReadClipboard />;
}
