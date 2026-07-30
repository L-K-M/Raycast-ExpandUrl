import { Color, Icon, List } from "@raycast/api";
import { countTrackingParams, describeChainStatus, describeStatus, describeVia } from "../lib/format";
import { displayHost } from "../lib/url";
import type { Chain, Hop } from "../lib/types";
import { HopDetail } from "./HopDetail";
import { HopActions, type HopActionsProps } from "./HopActions";

/** Icon and colour communicating what happened at a hop, before you read it. */
function hopIcon(hop: Hop, isLast: boolean): { source: Icon; tintColor: Color } {
  if (hop.error !== undefined) return { source: Icon.XMarkCircle, tintColor: Color.Red };
  if (hop.status === undefined) return { source: Icon.Circle, tintColor: Color.SecondaryText };
  if (hop.status >= 500) return { source: Icon.ExclamationMark, tintColor: Color.Red };
  if (hop.status >= 400) return { source: Icon.ExclamationMark, tintColor: Color.Orange };
  if (isLast) return { source: Icon.CheckCircle, tintColor: Color.Green };
  return { source: Icon.ArrowRightCircle, tintColor: Color.Blue };
}

function hopAccessories(hop: Hop, isLast: boolean): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];

  const trackers = hop.trackingParams?.length ?? 0;
  if (trackers > 0) {
    accessories.push({
      tag: { value: `${trackers} tracker${trackers === 1 ? "" : "s"}`, color: Color.Red },
      tooltip: `Tracking parameters: ${hop.trackingParams?.join(", ") ?? ""}`,
    });
  }

  if (hop.via === "meta-refresh") {
    accessories.push({ tag: { value: "meta", color: Color.Purple }, tooltip: "Reached by a meta refresh" });
  }

  accessories.push({
    text: describeStatus(hop),
    tooltip: hop.error !== undefined ? hop.error : `${describeVia(hop)} · ${describeStatus(hop)}`,
  });

  if (isLast && hop.status !== undefined && hop.error === undefined) {
    accessories.push({ tag: { value: "Final", color: Color.Green } });
  }

  return accessories;
}

export type ChainListProps = Omit<HopActionsProps, "hop" | "chain"> & { chain: Chain };

export function ChainList({ chain, ...actionProps }: ChainListProps) {
  const trackers = countTrackingParams(chain);
  const subtitle = [describeChainStatus(chain), trackers > 0 ? `${trackers} tracking parameters` : undefined]
    .filter((part) => part !== undefined)
    .join(" · ");

  return (
    <List.Section title="Redirect Chain" subtitle={subtitle}>
      {chain.hops.map((hop, index) => {
        const isLast = index === chain.hops.length - 1;
        let host: string;
        try {
          host = displayHost(new URL(hop.url));
        } catch {
          host = "";
        }

        return (
          <List.Item
            key={hop.index}
            id={String(hop.index)}
            icon={hopIcon(hop, isLast)}
            title={hop.url}
            subtitle={host}
            accessories={hopAccessories(hop, isLast)}
            detail={<HopDetail hop={hop} aggressiveTracking={actionProps.aggressiveTracking} />}
            actions={<HopActions hop={hop} chain={chain} {...actionProps} />}
          />
        );
      })}
    </List.Section>
  );
}
