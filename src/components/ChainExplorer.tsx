import { Action, ActionPanel, Clipboard, Icon, Keyboard, List, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChainList } from "./ChainList";
import { useExpansion } from "../hooks/useExpansion";
import { useHistory } from "../hooks/useHistory";
import { finalHop } from "../lib/format";
import { isTerminal } from "../lib/types";
import { displayHost, parseInput } from "../lib/url";
import { getSettings } from "../preferences";

export interface ChainExplorerProps {
  /** Seed text from a command argument or from fallback-command root search. */
  initialText?: string;
  /**
   * Read the clipboard even when the Clipboard preference is off.
   *
   * Set by the "Expand URL in Clipboard" command, where using the clipboard is
   * the whole point of running it rather than an inferred convenience.
   */
  alwaysReadClipboard?: boolean;
}

/**
 * The chain explorer, shared by both view commands.
 *
 * The search bar doubles as the URL input, which makes the whole interaction
 * launch → paste → ⏎. Filtering is off because the list is a redirect chain in
 * order, not a set of things to search.
 */
export function ChainExplorer({ initialText = "", alwaysReadClipboard = false }: ChainExplorerProps) {
  const settings = useMemo(() => getSettings(), []);
  const expansion = useExpansion(settings.expandOptions);
  const history = useHistory(settings.keepHistory);

  const [searchText, setSearchText] = useState(initialText);
  const [isShowingDetail, setIsShowingDetail] = useState(true);
  /**
   * Why the clipboard produced nothing, when the user explicitly asked for the
   * clipboard. Only set for the clipboard command: `Expand URL` reads the
   * clipboard as an unasked-for convenience, and a convenience that failed
   * should stay quiet.
   */
  const [clipboardProblem, setClipboardProblem] = useState<string | undefined>(undefined);

  /** Guards the one-shot seed-and-autostart so a re-render cannot repeat it. */
  const hasSeeded = useRef(initialText.length > 0);
  const hasAutoStarted = useRef(false);

  const parsed = useMemo(() => parseInput(searchText), [searchText]);

  // Once the user has touched the search bar, a launch-time clipboard
  // diagnostic is stale even if still technically true -- they have moved on
  // from "what was on the clipboard" to "what am I typing".
  const onSearchTextChange = (text: string) => {
    setClipboardProblem(undefined);
    setSearchText(text);
  };
  const { chain, isLoading, canExpandMore, start, expandNext, expandAll, stop, reset } = expansion;

  useEffect(() => {
    if (settings.warnings.length === 0) return;
    void showToast({
      style: Toast.Style.Failure,
      title: "Check extension preferences",
      message: settings.warnings.join("; "),
    });
  }, [settings.warnings]);

  // Seed the search bar from the clipboard when the command was opened with
  // nothing to work on. Only ever runs once, and only if the clipboard actually
  // holds something URL-shaped, so unrelated clipboard content is left alone.
  useEffect(() => {
    if (hasSeeded.current || !(alwaysReadClipboard || settings.readClipboard)) return;
    hasSeeded.current = true;

    let cancelled = false;
    void Clipboard.readText().then((text) => {
      if (cancelled) return;
      // parseInput trims internally, but trimming once here keeps the checked
      // value and the stored value visibly the same thing.
      const trimmed = (text ?? "").trim();

      if (parseInput(trimmed).url !== undefined) {
        setSearchText(trimmed);
        return;
      }

      // Running "Expand URL in Clipboard" and getting a blank screen reads as a
      // broken extension rather than an empty clipboard, so say which it was.
      if (alwaysReadClipboard) {
        setClipboardProblem(trimmed.length === 0 ? "Clipboard Is Empty" : "No URL in the Clipboard");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [alwaysReadClipboard, settings.readClipboard]);

  // Expand automatically once there is something to expand, if the user wants
  // that. With it off, no request is ever made without an explicit ⏎.
  useEffect(() => {
    if (hasAutoStarted.current || !settings.autoExpandOnLaunch) return;
    if (parsed.url === undefined) return;
    hasAutoStarted.current = true;
    start(parsed.url, settings.mode);
  }, [parsed.url, settings.autoExpandOnLaunch, settings.mode, start]);

  const expandCurrent = () => {
    if (parsed.url === undefined) return;
    hasAutoStarted.current = true;
    start(parsed.url, settings.mode);
  };

  const restartFrom = (url: string) => {
    setSearchText(url);
    const target = parseInput(url).url;
    if (target !== undefined) {
      hasAutoStarted.current = true;
      start(target, settings.mode);
    }
  };

  // Record a chain in history once it stops moving. Recording every snapshot
  // would rewrite the same row on every hop.
  const recordHistory = history.record;
  useEffect(() => {
    if (chain === undefined || !isTerminal(chain.status)) return;
    recordHistory({
      url: chain.source,
      finalUrl: finalHop(chain)?.url,
      hops: chain.hops.length,
    });
  }, [chain, recordHistory]);

  // The "Expand" row is only useful while the search bar holds something other
  // than what is already on screen.
  const needsExpanding = parsed.url !== undefined && chain?.source !== parsed.url.href;
  const showHistory = chain === undefined && history.entries.length > 0;

  const actionProps = {
    aggressiveTracking: settings.aggressiveTracking,
    canExpandMore,
    isLoading,
    isShowingDetail,
    onExpandNext: expandNext,
    onExpandAll: expandAll,
    onStop: stop,
    onRestartFrom: restartFrom,
    onToggleDetail: () => setIsShowingDetail((showing) => !showing),
  };

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={onSearchTextChange}
      searchBarPlaceholder="Paste a URL to expand…"
      filtering={false}
      isShowingDetail={isShowingDetail && chain !== undefined}
    >
      {needsExpanding && parsed.url !== undefined && (
        <List.Section title="Expand">
          <List.Item
            icon={Icon.Link}
            title={settings.mode === "step" ? "Expand This URL One Step" : "Expand This URL"}
            subtitle={displayHost(parsed.url)}
            accessories={[{ text: settings.mode === "step" ? "Step by step" : "Full chain" }]}
            actions={
              <ActionPanel>
                <Action title="Expand" icon={Icon.Link} onAction={expandCurrent} />
                {chain !== undefined && (
                  <Action title="Clear" icon={Icon.Trash} onAction={reset} shortcut={Keyboard.Shortcut.Common.Remove} />
                )}
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {chain !== undefined && <ChainList chain={chain} {...actionProps} />}

      {showHistory && (
        <List.Section title="Recently Expanded">
          {history.entries.map((entry) => (
            <List.Item
              key={entry.url}
              icon={Icon.Clock}
              title={entry.url}
              subtitle={entry.finalUrl !== undefined ? `→ ${entry.finalUrl}` : undefined}
              accessories={[{ text: `${entry.hops} ${entry.hops === 1 ? "hop" : "hops"}` }]}
              actions={
                <ActionPanel>
                  <Action title="Expand Again" icon={Icon.Link} onAction={() => restartFrom(entry.url)} />
                  <Action.CopyToClipboard title="Copy URL" content={entry.url} />
                  {entry.finalUrl !== undefined && (
                    <Action.CopyToClipboard
                      title="Copy Final URL"
                      content={entry.finalUrl}
                      shortcut={{
                        macOS: { modifiers: ["cmd", "shift"], key: "return" },
                        Windows: { modifiers: ["ctrl", "shift"], key: "return" },
                      }}
                    />
                  )}
                  <ActionPanel.Section>
                    <Action
                      title="Remove from History"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={() => history.forget(entry.url)}
                      shortcut={Keyboard.Shortcut.Common.Remove}
                    />
                    <Action
                      title="Clear History"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={history.clear}
                      shortcut={Keyboard.Shortcut.Common.RemoveAll}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {chain === undefined && !showHistory && (
        <List.EmptyView
          icon={Icon.Link}
          title={
            clipboardProblem ?? (searchText.trim().length === 0 ? "Paste a URL to Expand" : (parsed.error ?? "Ready"))
          }
          description={
            clipboardProblem !== undefined
              ? "Copy a URL and run this command again, or paste one here."
              : searchText.trim().length === 0
                ? "Every hop in the redirect chain stays visible and copyable."
                : parsed.error !== undefined
                  ? "Enter an http or https URL."
                  : "Press ⏎ to expand."
          }
        />
      )}
    </List>
  );
}
