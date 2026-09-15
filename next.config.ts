import type { NextConfig } from 'next';

/**
 * `RADAR_STATIC=1` builds the GitHub Pages version: no server, the page reads the JSON
 * snapshot `scripts/snapshot.ts` wrote into `public/data`. `RADAR_BASE_PATH` is the
 * repository sub-path Pages serves from.
 */
const isStatic = process.env.RADAR_STATIC === '1';
const basePath = process.env.RADAR_BASE_PATH ?? '';

const config: NextConfig = {
  // better-sqlite3 é módulo nativo: precisa ficar fora do bundle do servidor.
  serverExternalPackages: ['better-sqlite3'],

  // Sem isto o rastreio sobe até o diretório home, atrás de um package-lock.json solto.
  outputFileTracingRoot: import.meta.dirname,

  ...(isStatic
    ? {
        output: 'export',
        basePath,
        images: { unoptimized: true },
      }
    : {}),

  env: {
    NEXT_PUBLIC_RADAR_STATIC: isStatic ? '1' : '',
    // The data URLs are absolute now that the app has sub-routes, so the client needs the prefix.
    NEXT_PUBLIC_RADAR_BASE_PATH: isStatic ? basePath : '',
  },
};

export default config;
