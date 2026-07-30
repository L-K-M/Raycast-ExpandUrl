import { Color, Icon, List } from "@raycast/api";
import {
  chainOutcome,
  countTrackingParams,
  describeChainStatus,
  describeStatus,
  describeVia,
  OUTCOME_LABELS,
  type ChainOutcome,
} from "../lib/format";
import { displayHost } from "../lib/url";
import type { Chain, ChainStatus, Hop } from "../lib/types";
import { HopDetail } from "./HopDetail";
import { HopActions, type HopActionsProps } from "./HopActions";

/**
 * Presentation for each way a chain can end.
 *
 * Keyed by `ChainOutcome`, so adding a terminal status without deciding how it
 * looks is a type error rather than a silently mislabelled row. Which statuses
 * count as endings — and what they are called — lives in `lib/format.ts` where
 * it is testable.
 */
const OUTCOME_STYLE: Record<ChainOutcome, { icon: Icon; color: Color }> = {
  final: { icon: Icon.CheckCircle, color: Color.Green },
  loop: { icon: Icon.Repeat, color: Color.Orange },
  "max-hops": { icon: Icon.Ellipsis, color: Color.Orange },
  stopped: { icon: Icon.Stop, color: Color.SecondaryText },
  error: { icon: Icon.XMarkCircle, color: Color.Red },
};

/** Ending style for the last row, or undefined when the chain may still grow. */
function endingFor(isLast: boolean, status: ChainStatus): { icon: Icon; color: Color; tag: string } | undefined {
  if (!isLast) return undefined;
  const ending = chainOutcome(status);
  if (ending === undefined) return undefined;
  return { ...OUTCOME_STYLE[ending], tag: OUTCOME_LABELS[ending] };
}

/** Icon and colour communicating what happened at a hop, before you read it. */
function hopIcon(hop: Hop, isLast: boolean, status: ChainStatus): { source: Icon; tintColor: Color } {
  if (hop.error !== undefined) return { source: Icon.XMarkCircle, tintColor: Color.Red };
  if (hop.status === undefined) return { source: Icon.Circle, tintColor: Color.SecondaryText };
  if (hop.status >= 500) return { source: Icon.ExclamationMark, tintColor: Color.Red };
  if (hop.status >= 400) return { source: Icon.ExclamationMark, tintColor: Color.Orange };

  const ending = endingFor(isLast, status);
  if (ending !== undefined) return { source: ending.icon, tintColor: ending.color };

  return { source: Icon.ArrowRightCircle, tintColor: Color.Blue };
}

function hopAccessories(hop: Hop, isLast: boolean, status: ChainStatus): List.Item.Accessory[] {
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

  const ending = hop.status !== undefined && hop.error === undefined ? endingFor(isLast, status) : undefined;
  if (ending !== undefined) {
    accessories.push({ tag: { value: ending.tag, color: ending.color } });
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
            icon={hopIcon(hop, isLast, chain.status)}
            title={hop.url}
            subtitle={host}
            accessories={hopAccessories(hop, isLast, chain.status)}
            detail={<HopDetail hop={hop} aggressiveTracking={actionProps.aggressiveTracking} />}
            actions={<HopActions hop={hop} chain={chain} {...actionProps} />}
          />
        );
      })}
    </List.Section>
  );
}
