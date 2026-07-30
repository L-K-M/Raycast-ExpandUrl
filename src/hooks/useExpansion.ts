import { showFailureToast } from "@raycast/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { expandChain } from "../lib/expand";
import { isTerminal, type Chain, type ExpandOptions } from "../lib/types";
import type { ExpansionMode } from "../preferences";

/**
 * Drives the expansion generator from React.
 *
 * The generator owns the walking; this hook owns *when to pull*. That split is
 * what makes both expansion modes the same code path: full mode pulls until the
 * generator is done, step mode pulls once per keystroke.
 */

export interface Expansion {
  chain?: Chain;
  isLoading: boolean;
  /** True when the chain is parked with a next hop that has not been requested. */
  canExpandMore: boolean;
  start: (url: URL, mode: ExpansionMode) => void;
  expandNext: () => void;
  expandAll: () => void;
  stop: () => void;
  reset: () => void;
}

export function useExpansion(options: ExpandOptions): Expansion {
  const [chain, setChain] = useState<Chain | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const generator = useRef<AsyncGenerator<Chain, Chain, void> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  /**
   * Identifies the current run. A late snapshot from a superseded run must not
   * overwrite the current one — easy to hit by editing the search bar while a
   * slow chain is still resolving.
   */
  const runId = useRef(0);
  const mounted = useRef(true);
  /**
   * The run currently being pulled, if any.
   *
   * Async generators throw if `next()` is called while a previous `next()` is
   * still pending, so a resume must not overlap an in-flight pull of the *same*
   * run. It has to be keyed by run id rather than a plain boolean: a superseded
   * run can still be parked on an `await` when a new one starts, and a boolean
   * would make the new run a no-op — leaving the spinner up and nothing
   * expanding.
   */
  const drivingRunId = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  /** Pulls snapshots until the generator finishes or the mode says to stop. */
  const drive = useCallback(async (mode: ExpansionMode, id: number) => {
    const active = generator.current;
    if (active === undefined || drivingRunId.current === id) return;

    drivingRunId.current = id;
    setIsLoading(true);
    try {
      for (;;) {
        const step = await active.next();
        if (id !== runId.current || !mounted.current) return;

        const snapshot = step.value;
        setChain(snapshot);

        if (step.done === true || isTerminal(snapshot.status)) return;
        // In step mode a paused chain is where the user takes over. Everything
        // else (a "running" snapshot mid-request) keeps going regardless.
        if (mode === "step" && snapshot.status === "paused") return;
      }
    } catch (error) {
      // The engine turns network failures into hops rather than throwing, so
      // reaching here means something unexpected broke. Surface it instead of
      // leaving a spinner running forever.
      if (id === runId.current && mounted.current) {
        void showFailureToast(error, { title: "Expansion failed" });
      }
    } finally {
      // Only clear the marker if it is still ours; a newer run may have claimed
      // it while this one was unwinding.
      if (drivingRunId.current === id) {
        drivingRunId.current = undefined;
      }
      if (id === runId.current && mounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const start = useCallback(
    (url: URL, mode: ExpansionMode) => {
      controller.current?.abort();

      const nextController = new AbortController();
      controller.current = nextController;
      const id = (runId.current += 1);

      generator.current = expandChain(url, options, nextController.signal);
      void drive(mode, id);
    },
    [drive, options],
  );

  const resume = useCallback(
    (mode: ExpansionMode) => {
      if (generator.current === undefined) return;
      void drive(mode, runId.current);
    },
    [drive],
  );

  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    // Bumping the run id orphans any in-flight drive loop, so its snapshots
    // cannot resurrect the chain we are clearing here.
    runId.current += 1;
    generator.current = undefined;
    setChain(undefined);
    setIsLoading(false);
  }, []);

  return {
    chain,
    isLoading,
    canExpandMore: chain?.status === "paused",
    start,
    expandNext: () => resume("step"),
    expandAll: () => resume("full"),
    stop,
    reset,
  };
}
