'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Explicit selections persist locally and survive navigation between screens. */
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
  try { localStorage.setItem(`radar-selection-${key}`, JSON.stringify([...next.ticked])); } catch { /* Selection remains available during this session. */ }
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
      if (!selections.has(key)) {
        try {
          const saved: unknown = JSON.parse(localStorage.getItem(`radar-selection-${key}`) ?? '[]');
          if (Array.isArray(saved) && saved.every(t => typeof t === 'string')) selections.set(key, { unticked: new Set(), ticked: new Set(saved) });
        } catch { /* Keep the empty selection if browser storage is unavailable. */ }
      }
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
    isApprovedIn: (ticker: string) => selection.ticked.has(ticker),
    isPendingIn: (ticker: string) => selection.ticked.has(ticker),
    toggleApproved: (ticker: string) =>
      update({ ...selection, ticked: flip(selection.ticked, ticker) }),
    togglePending: (ticker: string) =>
      update({ ...selection, ticked: flip(selection.ticked, ticker) }),
    allApproved: (tickers: string[]) => update({ ...selection, ticked: new Set([...selection.ticked, ...tickers]) }),
    noApproved: (tickers: string[]) => update({ ...selection, ticked: new Set([...selection.ticked].filter(t => !tickers.includes(t))) }),
    allPending: (tickers: string[]) => update({ ...selection, ticked: new Set([...selection.ticked, ...tickers]) }),
    noPending: (tickers: string[]) => update({ ...selection, ticked: new Set([...selection.ticked].filter(t => !tickers.includes(t))) }),
  };
}

/** The chosen papers, approved first, in the order the ranking put them. */
export function selectedFrom<T extends { ticker: string }>(
  selection: Selection,
  approved: T[],
  pending: T[],
): T[] {
  return [
    ...approved.filter((item) => selection.ticked.has(item.ticker)),
    ...pending.filter((item) => selection.ticked.has(item.ticker)),
  ];
}
