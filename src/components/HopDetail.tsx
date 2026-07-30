import { Color, Icon, List } from "@raycast/api";
import { describeStatus, describeVia } from "../lib/format";
import { isTrackingParam } from "../lib/tracking";
import type { Hop } from "../lib/types";

const { Label, Separator, TagList, Link } = List.Item.Detail.Metadata;

/** Renders a duration the way a person reads it, not the way a float prints. */
function formatElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Truncates a value so one enormous parameter cannot push everything off-screen. */
function truncate(value: string, limit = 120): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/**
 * The metadata panel for one hop.
 *
 * Query parameters get one row each, with trackers tagged. That breakdown is
 * the reason the detail pane exists at all: a 12-parameter `utm_` soup is
 * unreadable as a single line of text and obvious as a list.
 */
export function HopDetail({ hop, aggressiveTracking }: { hop: Hop; aggressiveTracking: boolean }) {
  let url: URL | undefined;
  try {
    url = new URL(hop.url);
  } catch {
    url = undefined;
  }

  const parameters = url === undefined ? [] : [...url.searchParams.entries()];

  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <Link title="URL" target={hop.url} text={truncate(hop.url, 80)} />
          {url !== undefined && <Label title="Host" text={url.hostname} />}
          {url !== undefined && url.pathname !== "/" && <Label title="Path" text={truncate(url.pathname)} />}
          {url !== undefined && (
            <Label
              title="Scheme"
              text={url.protocol.replace(":", "")}
              icon={
                url.protocol === "https:"
                  ? { source: Icon.Lock, tintColor: Color.Green }
                  : { source: Icon.Warning, tintColor: Color.Orange }
              }
            />
          )}

          <Separator />

          <Label title="Reached by" text={describeVia(hop)} />
          <Label
            title="Status"
            text={describeStatus(hop)}
            icon={hop.error !== undefined ? { source: Icon.XMarkCircle, tintColor: Color.Red } : undefined}
          />
          {hop.method !== undefined && <Label title="Method" text={hop.method} />}
          {hop.elapsedMs !== undefined && <Label title="Time" text={formatElapsed(hop.elapsedMs)} />}
          {hop.contentType !== undefined && <Label title="Content type" text={hop.contentType} />}
          {hop.server !== undefined && <Label title="Server" text={hop.server} />}
          {hop.documentTitle !== undefined && <Label title="Page title" text={truncate(hop.documentTitle)} />}

          {parameters.length > 0 && <Separator />}
          {parameters.map(([name, value], index) => (
            <TagList key={`${name}-${index}`} title={name}>
              <TagList.Item
                text={truncate(value, 60) || "(empty)"}
                color={isTrackingParam(name, { aggressive: aggressiveTracking }) ? Color.Red : Color.SecondaryText}
              />
            </TagList>
          ))}
        </List.Item.Detail.Metadata>
      }
    />
  );
}
