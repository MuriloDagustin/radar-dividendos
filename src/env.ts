import { existsSync } from 'node:fs';

/**
 * Next loads `.env` on its own, tsx does not — without this the CLI ignored the token in
 * the file and hit brapi unauthenticated. A variable already set in the environment wins.
 */
export function loadEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  const alreadySet = new Set(Object.keys(process.env));
  process.loadEnvFile(path);
  for (const key of alreadySet) {
    const original = process.env[key];
    if (original !== undefined) process.env[key] = original;
  }
}
