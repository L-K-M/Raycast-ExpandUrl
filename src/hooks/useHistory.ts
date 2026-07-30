import { LocalStorage } from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { addEntry, parseHistory, removeEntry, serializeHistory, type HistoryEntry } from "../lib/history";

const STORAGE_KEY = "expand-url:history";

export interface History {
  entries: HistoryEntry[];
  record: (entry: Omit<HistoryEntry, "at">) => void;
  forget: (url: string) => void;
  clear: () => void;
}

/**
 * `LocalStorage`-backed list of recent expansions.
 *
 * Every mutation is a pure `setEntries` call and persistence happens in an
 * effect, rather than each mutation writing storage itself. That split matters:
 * React may invoke a state updater more than once for a single update — it does
 * so deliberately under StrictMode — so a write placed inside an updater fires
 * twice, and a `Date.now()` read inside one can produce two different values
 * with only the second kept. Timestamps are therefore taken before the updater
 * runs, and storage is written once per settled state.
 *
 * Writes stay fire-and-forget: history is a convenience, and a failed write is
 * not worth interrupting the user over.
 */
export function useHistory(enabled: boolean): History {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  /** Stops the persist effect writing back the value it has just loaded. */
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void LocalStorage.getItem<string>(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      setEntries(parseHistory(raw));
      hasLoaded.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !hasLoaded.current) return;
    void LocalStorage.setItem(STORAGE_KEY, serializeHistory(entries));
  }, [enabled, entries]);

  const record = useCallback(
    (entry: Omit<HistoryEntry, "at">) => {
      if (!enabled) return;
      // Read the clock out here: a repeated invocation of the updater must not
      // be able to produce a different timestamp than the one actually kept.
      const at = Date.now();
      setEntries((current) => addEntry(current, { ...entry, at }));
    },
    [enabled],
  );

  // Functional updates rather than closing over `entries`, so two removals
  // dispatched before a re-render cannot resurrect the first one.
  const forget = useCallback((url: string) => {
    setEntries((current) => removeEntry(current, url));
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries: enabled ? entries : [], record, forget, clear };
}
