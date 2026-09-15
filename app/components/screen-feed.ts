'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { STATIC_SITE } from '@/app/mode';

export interface Progress {
  universe: number;
  candidates: number;
  skipped: number;
  done: number;
}

export interface FeedFailure {
  ticker: string;
  message: string;
}

/** What both market screens answer, once they finish; the shape `MarketScreen` and `StockMarketScreen` share. */
export interface ScreenReport<T> {
  generatedAt: string;
  universe: number;
  candidates: number;
  skipped: number;
  approved: T[];
  pending: T[];
  rejected: T[];
  failed: FeedFailure[];
}

/** The two streams differ only in what they call a row; the spec normalises them to this. */
export type FeedEvent<T> =
  | { type: 'universe'; universe: number; candidates: number; skipped: number }
  | { type: 'item'; done: number; item: T }
  | { type: 'failure'; done: number; failure: FeedFailure }
  | { type: 'done'; report: ScreenReport<T> };

export interface FeedState<T> {
  progress: Progress | null;
  items: T[];
  failed: FeedFailure[];
  report: ScreenReport<T> | null;
  error: string | null;
  running: boolean;
}

const IDLE: FeedState<never> = {
  progress: null,
  items: [],
  failed: [],
  report: null,
  error: null,
  running: true,
};

export interface Feed<T> {
  key: string;
  url(): string;
  normalize(raw: unknown): FeedEvent<T>;
}

function apply<T>(state: FeedState<T>, event: FeedEvent<T>): FeedState<T> {
  switch (event.type) {
    case 'universe':
      return {
        ...state,
        progress: {
          universe: event.universe,
          candidates: event.candidates,
          skipped: event.skipped,
          done: 0,
        },
      };
    case 'item':
      return {
        ...state,
        items: [...state.items, event.item],
        progress: state.progress ? { ...state.progress, done: event.done } : null,
      };
    case 'failure':
      return {
        ...state,
        failed: [...state.failed, event.failure],
        progress: state.progress ? { ...state.progress, done: event.done } : null,
      };
    case 'done':
      return { ...state, report: event.report, running: false };
  }
}

/** The snapshot is a finished report; it lands in the same state a completed stream would. */
function fromReport<T>(report: ScreenReport<T>): FeedState<T> {
  return {
    progress: {
      universe: report.universe,
      candidates: report.candidates,
      skipped: report.skipped,
      done: report.candidates,
    },
    items: [...report.approved, ...report.pending, ...report.rejected],
    failed: report.failed,
    report,
    error: null,
    running: false,
  };
}

/** The route answers one JSON object per line; a line is complete only once its newline arrives. */
export async function readLines(response: Response, onLine: (raw: unknown) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('A resposta veio sem corpo.');
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onLine(JSON.parse(line) as unknown);
      newline = buffer.indexOf('\n');
    }
  }
}

/**
 * A screen runs once per visit and keeps running even if the reader leaves the page: the
 * rows live here, outside React, so walking from the table to the portfolio and back does
 * not start a scrape over. `refresh` is the only way to ask the sources again.
 */
interface Run {
  state: FeedState<unknown>;
  listeners: Set<() => void>;
  started: boolean;
}

const runs = new Map<string, Run>();

function runOf(key: string): Run {
  let run = runs.get(key);
  if (!run) {
    run = { state: IDLE, listeners: new Set(), started: false };
    runs.set(key, run);
  }
  return run;
}

function publish(key: string, state: FeedState<unknown>): void {
  const run = runOf(key);
  run.state = state;
  for (const listener of run.listeners) listener();
}

async function start<T>(feed: Feed<T>): Promise<void> {
  const run = runOf(feed.key);
  if (run.started) return;
  run.started = true;
  publish(feed.key, IDLE);

  try {
    const response = await fetch(feed.url());
    if (!response.ok) throw new Error(`A triagem falhou (HTTP ${response.status}).`);

    if (STATIC_SITE) {
      publish(feed.key, fromReport((await response.json()) as ScreenReport<T>));
      return;
    }

    await readLines(response, (raw) => {
      const state = runOf(feed.key).state as FeedState<T>;
      publish(feed.key, apply(state, feed.normalize(raw)) as FeedState<unknown>);
    });

    // A stream that ends without its closing event was cut short: say so instead of looking done.
    const state = runOf(feed.key).state;
    if (!state.report && !state.error) {
      publish(feed.key, { ...state, running: false, error: 'A conexão caiu antes do fim da triagem.' });
    }
  } catch (error) {
    const state = runOf(feed.key).state;
    publish(feed.key, {
      ...state,
      running: false,
      error: error instanceof Error ? error.message : 'Não foi possível falar com o servidor.',
    });
  }
}

export function refreshFeed<T>(feed: Feed<T>): void {
  runs.delete(feed.key);
  void start(feed);
}

export function useScreenFeed<T>(feed: Feed<T>): FeedState<T> {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const run = runOf(feed.key);
      run.listeners.add(onChange);
      return () => {
        run.listeners.delete(onChange);
      };
    },
    [feed.key],
  );
  const snapshot = useCallback(() => runOf(feed.key).state as FeedState<T>, [feed.key]);
  const server = useCallback(() => IDLE as FeedState<T>, []);

  const state = useSyncExternalStore(subscribe, snapshot, server);
  useEffect(() => {
    void start(feed);
  }, [feed]);

  return state;
}
