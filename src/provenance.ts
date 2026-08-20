import { SOURCE_NAME, type FundamentalField, type ProvenanceMap } from './types';

/**
 * The net debt/EBITDA ratio may have arrived ready from one source or been computed from
 * debt and EBITDA — possibly from different sources. The label has to say which, otherwise
 * the number looks firmer than it is.
 */
export function provenanceLabel(provenance: ProvenanceMap, key: string): string {
  if (key === 'netDebtToEbitda') {
    const direct = provenance.netDebtToEbitda;
    if (direct) return SOURCE_NAME[direct.source];

    const parts = (['netDebt', 'ebitda'] as const)
      .map((field) => provenance[field])
      .filter((p) => p !== null);
    if (parts.length === 0) return '';

    const sources = [...new Set(parts.map((p) => SOURCE_NAME[p.source]))];
    return `${sources.join(' + ')}, calculado`;
  }

  const entry = provenance[key as FundamentalField];
  if (!entry) return '';
  return `${SOURCE_NAME[entry.source]}${entry.derived ? ', derivado' : ''}`;
}
