import Database from 'better-sqlite3';
import type { Analysis } from './types';

export const TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_PATH = 'radar-dividendos.sqlite';

export interface Cache {
  read(ticker: string): Analysis | null;
  write(ticker: string, analysis: Analysis): void;
  close(): void;
}

class SqliteCache implements Cache {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analyses (
        ticker     TEXT PRIMARY KEY,
        written_at INTEGER NOT NULL,
        payload    TEXT NOT NULL
      );
    `);
  }

  read(ticker: string): Analysis | null {
    const row = this.db
      .prepare<[string], { written_at: number; payload: string }>(
        'SELECT written_at, payload FROM analyses WHERE ticker = ?',
      )
      .get(ticker);
    if (!row) return null;

    if (Date.now() - row.written_at > TTL_MS) {
      this.db.prepare('DELETE FROM analyses WHERE ticker = ?').run(ticker);
      return null;
    }

    try {
      return { ...(JSON.parse(row.payload) as Analysis), fromCache: true };
    } catch {
      // Payload from an older shape of the format: drop it and fetch again.
      this.db.prepare('DELETE FROM analyses WHERE ticker = ?').run(ticker);
      return null;
    }
  }

  write(ticker: string, analysis: Analysis): void {
    this.db
      .prepare(
        `INSERT INTO analyses (ticker, written_at, payload) VALUES (?, ?, ?)
         ON CONFLICT(ticker) DO UPDATE SET written_at = excluded.written_at, payload = excluded.payload`,
      )
      .run(ticker, Date.now(), JSON.stringify({ ...analysis, fromCache: false }));
  }

  close(): void {
    this.db.close();
  }
}

const disabledCache: Cache = {
  read: () => null,
  write: () => {},
  close: () => {},
};

export function openCache(options: { enabled: boolean; path?: string }): Cache {
  if (!options.enabled) return disabledCache;
  return new SqliteCache(options.path ?? process.env.RADAR_CACHE_PATH ?? DEFAULT_PATH);
}
