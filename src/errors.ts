export class RadarError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTickerError extends RadarError {
  constructor(ticker: string) {
    super(
      `Ticker "${ticker}" não parece um papel da B3 (esperado 4 letras + 1 ou 2 dígitos, ex.: TAEE11, ITSA4).`,
      'TICKER_INVALIDO',
    );
  }
}

export class TickerNotFoundError extends RadarError {
  constructor(ticker: string, source?: string, otherFailures: string[] = []) {
    const where = source ? ` em ${source}` : '';
    const extra =
      otherFailures.length > 0 ? `\n  Demais fontes: ${otherFailures.join('; ')}` : '';
    super(`Ticker "${ticker}" não existe${where}.${extra}`, 'TICKER_NAO_ENCONTRADO');
  }
}

export class SourceUnavailableError extends RadarError {
  constructor(source: string, detail: string) {
    super(`Fonte ${source} indisponível: ${detail}`, 'FONTE_INDISPONIVEL');
  }
}

/**
 * Deliberately loud: if the Fundamentus HTML or the brapi JSON changes shape, failing here
 * beats carrying on with a wrong number.
 */
export class UnexpectedFormatError extends RadarError {
  constructor(source: string, detail: string) {
    super(
      `Formato de ${source} mudou: ${detail}. Atualize o parser antes de confiar nos números.`,
      'FORMATO_INESPERADO',
    );
  }
}

export class NoDataError extends RadarError {
  constructor(ticker: string, reasons: string[]) {
    super(
      `Nenhuma fonte respondeu com dados para "${ticker}":\n  - ${reasons.join('\n  - ')}`,
      'SEM_DADOS',
    );
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
