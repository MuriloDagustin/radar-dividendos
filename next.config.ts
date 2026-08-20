import type { NextConfig } from 'next';

const config: NextConfig = {
  // better-sqlite3 é módulo nativo: precisa ficar fora do bundle do servidor.
  serverExternalPackages: ['better-sqlite3'],

  // Sem isto o rastreio sobe até o diretório home, atrás de um package-lock.json solto.
  outputFileTracingRoot: import.meta.dirname,
};

export default config;
