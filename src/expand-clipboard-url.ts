import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { expandFully } from "./lib/expand";
import { describeChainStatus, finalHop } from "./lib/format";
import { stripTrackingParams } from "./lib/tracking";
import { parseInput } from "./lib/url";
import { getSettings } from "./preferences";

/**
 * Expand the clipboard URL and copy the destination back.
 *
 * This is the "just give me the answer" path, and it is a separate command on
 * purpose. The main command never collapses a chain to its destination
 * implicitly; choosing to skip the chain has to be an explicit act, which is
 * what running this command is.
 */
export default async function Command() {
  const settings = getSettings();

  const clipboard = await Clipboard.readText();
  const parsed = parseInput(clipboard ?? "");

  if (parsed.url === undefined) {
    await showHUD(clipboard === undefined ? "❌ Clipboard is empty" : `❌ ${parsed.error ?? "Not a URL"}`);
    return;
  }

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Expanding…",
    message: parsed.url.hostname,
  });

  const chain = await expandFully(parsed.url, settings.expandOptions);
  const destination = finalHop(chain);

  if (destination === undefined || chain.status === "error") {
    toast.style = Toast.Style.Failure;
    toast.title = "Could not expand";
    toast.message = chain.message ?? "The first hop failed";
    return;
  }

  const { url, removed } = stripTrackingParams(destination.url, { aggressive: settings.aggressiveTracking });
  await Clipboard.copy(url);
  await toast.hide();

  // The HUD is the entire report for this command, so it has to say what the
  // chain actually did rather than just that something happened.
  const redirects = chain.hops.length - 1;
  const parts = [
    redirects === 0 ? "No redirects" : `${redirects} redirect${redirects === 1 ? "" : "s"}`,
    removed.length > 0 ? `stripped ${removed.length} tracker${removed.length === 1 ? "" : "s"}` : undefined,
    chain.status === "final" ? undefined : describeChainStatus(chain),
  ].filter((part) => part !== undefined);

  await showHUD(`📋 ${new URL(url).hostname} · ${parts.join(" · ")}`);
}
