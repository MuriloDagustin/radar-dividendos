'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which papers go to the portfolio. Approved ones are in by default and pending ones out, so
 * the sets record only the reader's departures from that — which keeps the default right
 * while rows are still streaming in. It lives outside React because the choice has to survive
 * the walk from the screening table to the portfolio page.
 */
export interface Selection {
  unticked: ReadonlySet<string>;
  ticked: ReadonlySet<string>;
}

const EMPTY: Selection = { unticked: new Set(), ticked: new Set() };

const selections = new Map<string, Selection>();
const listeners = new Map<string, Set<() => void>>();

export function selectionOf(key: string): Selection {
  return selections.get(key) ?? EMPTY;
}

export function setSelection(key: string, next: Selection): void {
  selections.set(key, next);
  for (const listener of listeners.get(key) ?? []) listener();
}

function flip(set: ReadonlySet<string>, ticker: string): Set<string> {
  const next = new Set(set);
  if (next.has(ticker)) next.delete(ticker);
  else next.add(ticker);
  return next;
}

export function useSelection(key: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const set = listeners.get(key) ?? new Set<() => void>();
      listeners.set(key, set);
      set.add(onChange);
      return () => {
        set.delete(onChange);
      };
    },
    [key],
  );
  const selection = useSyncExternalStore(
    subscribe,
    () => selectionOf(key),
    () => EMPTY,
  );

  const update = useCallback((next: Selection) => setSelection(key, next), [key]);

  return {
    selection,
    isApprovedIn: (ticker: string) => !selection.unticked.has(ticker),
    isPendingIn: (ticker: string) => selection.ticked.has(ticker),
    toggleApproved: (ticker: string) =>
      update({ ...selection, unticked: flip(selection.unticked, ticker) }),
    togglePending: (ticker: string) =>
      update({ ...selection, ticked: flip(selection.ticked, ticker) }),
    allApproved: () => update({ ...selection, unticked: new Set() }),
    noApproved: (tickers: string[]) => update({ ...selection, unticked: new Set(tickers) }),
    allPending: (tickers: string[]) => update({ ...selection, ticked: new Set(tickers) }),
    noPending: () => update({ ...selection, ticked: new Set() }),
  };
}

/** The chosen papers, approved first, in the order the ranking put them. */
export function selectedFrom<T extends { ticker: string }>(
  selection: Selection,
  approved: T[],
  pending: T[],
): T[] {
  return [
    ...approved.filter((item) => !selection.unticked.has(item.ticker)),
    ...pending.filter((item) => selection.ticked.has(item.ticker)),
  ];
}
