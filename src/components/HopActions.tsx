import { Action, ActionPanel, Icon, Keyboard, showToast, Toast } from "@raycast/api";
import { chainToMarkdown, chainToText, finalHop } from "../lib/format";
import { stripTrackingParams } from "../lib/tracking";
import type { Chain, Hop } from "../lib/types";

export interface HopActionsProps {
  hop: Hop;
  chain: Chain;
  aggressiveTracking: boolean;
  canExpandMore: boolean;
  isLoading: boolean;
  isShowingDetail: boolean;
  onExpandNext: () => void;
  onExpandAll: () => void;
  onStop: () => void;
  onRestartFrom: (url: string) => void;
  onToggleDetail: () => void;
}

/**
 * Builds a cross-platform shortcut from its macOS form.
 *
 * `cmd` has no Windows equivalent, so a shortcut declaring only `cmd` is
 * ambiguous in an extension that ships on both — which is exactly what
 * `@raycast/no-ambiguous-platform-shortcut` warns about. That rule only
 * inspects inline object literals, so a helper returning `{ modifiers, key }`
 * would have hidden the warning rather than fixed anything. Doing the
 * `cmd` → `ctrl` mapping here makes every call site correct by construction.
 */
function shortcut(modifiers: Keyboard.KeyModifier[], key: Keyboard.KeyEquivalent): Keyboard.Shortcut {
  return {
    macOS: { modifiers, key },
    Windows: { modifiers: modifiers.map((modifier) => (modifier === "cmd" ? "ctrl" : modifier)), key },
  };
}

export function HopActions({
  hop,
  chain,
  aggressiveTracking,
  canExpandMore,
  isLoading,
  isShowingDetail,
  onExpandNext,
  onExpandAll,
  onStop,
  onRestartFrom,
  onToggleDetail,
}: HopActionsProps) {
  const clean = stripTrackingParams(hop.url, { aggressive: aggressiveTracking });
  const destination = finalHop(chain);

  return (
    <ActionPanel>
      <ActionPanel.Section>
        {/*
          Copying an intermediate URL is the whole point of the extension, so it
          is the default action even when more of the chain could be expanded.
        */}
        <Action.CopyToClipboard title="Copy URL" content={hop.url} icon={Icon.Clipboard} />
        {clean.removed.length > 0 && (
          <Action.CopyToClipboard
            title={`Copy URL Without ${clean.removed.length} Tracking Parameter${clean.removed.length === 1 ? "" : "s"}`}
            content={clean.url}
            icon={Icon.Eraser}
            shortcut={shortcut(["cmd", "shift"], "c")}
          />
        )}
        {destination !== undefined && destination.url !== hop.url && (
          <Action.CopyToClipboard
            title="Copy Final URL"
            content={destination.url}
            icon={Icon.Goal}
            shortcut={shortcut(["cmd", "shift"], "return")}
          />
        )}
        <Action.Paste title="Paste URL" content={hop.url} shortcut={shortcut(["cmd"], "v")} />
      </ActionPanel.Section>

      <ActionPanel.Section title="Expand">
        {canExpandMore && (
          <Action
            title="Expand Next Step"
            icon={Icon.ArrowRight}
            onAction={onExpandNext}
            shortcut={shortcut(["cmd"], "arrowRight")}
          />
        )}
        {canExpandMore && (
          <Action
            title="Expand All Remaining"
            icon={Icon.ArrowRightCircle}
            onAction={onExpandAll}
            shortcut={shortcut(["cmd", "shift"], "arrowRight")}
          />
        )}
        {isLoading && (
          <Action title="Stop Expanding" icon={Icon.Stop} onAction={onStop} shortcut={shortcut(["cmd"], ".")} />
        )}
        {hop.index > 0 && (
          <Action
            title="Restart from This Hop"
            icon={Icon.Repeat}
            onAction={() => onRestartFrom(hop.url)}
            shortcut={shortcut(["cmd"], "r")}
          />
        )}
      </ActionPanel.Section>

      <ActionPanel.Section title="Open">
        <Action.OpenInBrowser
          title="Open in Browser"
          url={hop.url}
          shortcut={shortcut(["cmd"], "o")}
          // Opening a hop consumes it, exactly like clicking the original link.
          onOpen={() => {
            void showToast({ style: Toast.Style.Success, title: "Opened", message: hop.url });
          }}
        />
        {clean.removed.length > 0 && (
          <Action.OpenInBrowser
            title="Open Without Tracking Parameters"
            url={clean.url}
            icon={Icon.Eraser}
            shortcut={shortcut(["cmd", "shift"], "o")}
          />
        )}
        <Action.CreateQuicklink quicklink={{ link: hop.url, name: `Open ${hop.url}` }} />
      </ActionPanel.Section>

      <ActionPanel.Section title="Whole Chain">
        <Action.CopyToClipboard
          title="Copy Chain as Markdown"
          content={chainToMarkdown(chain)}
          icon={Icon.Document}
          shortcut={shortcut(["cmd", "shift"], "m")}
        />
        <Action.CopyToClipboard
          title="Copy Chain as Plain Text"
          content={chainToText(chain)}
          icon={Icon.Text}
          shortcut={shortcut(["cmd", "shift"], "t")}
        />
      </ActionPanel.Section>

      <ActionPanel.Section title="View">
        <Action
          title={isShowingDetail ? "Hide Details" : "Show Details"}
          icon={Icon.Sidebar}
          onAction={onToggleDetail}
          shortcut={shortcut(["cmd"], "y")}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
