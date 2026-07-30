import { LocalStorage } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
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
 * Writes are fire-and-forget: history is a convenience, and a failed write is
 * not worth interrupting the user over.
 */
export function useHistory(enabled: boolean): History {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void LocalStorage.getItem<string>(STORAGE_KEY).then((raw) => {
      if (!cancelled) setEntries(parseHistory(raw));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const persist = useCallback((next: HistoryEntry[]) => {
    setEntries(next);
    void LocalStorage.setItem(STORAGE_KEY, serializeHistory(next));
  }, []);

  const record = useCallback(
    (entry: Omit<HistoryEntry, "at">) => {
      if (!enabled) return;
      setEntries((current) => {
        const next = addEntry(current, { ...entry, at: Date.now() });
        void LocalStorage.setItem(STORAGE_KEY, serializeHistory(next));
        return next;
      });
    },
    [enabled],
  );

  const forget = useCallback(
    (url: string) => {
      persist(removeEntry(entries, url));
    },
    [entries, persist],
  );

  const clear = useCallback(() => {
    setEntries([]);
    void LocalStorage.removeItem(STORAGE_KEY);
  }, []);

  return { entries: enabled ? entries : [], record, forget, clear };
}
