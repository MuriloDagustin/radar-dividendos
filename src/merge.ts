import {
  FUNDAMENTAL_FIELDS,
  emptyFundamentals,
  type Fundamentals,
  type ProvenanceMap,
  type SourceReading,
} from './types';

function emptyProvenance(): ProvenanceMap {
  const map = {} as ProvenanceMap;
  for (const field of FUNDAMENTAL_FIELDS) map[field] = null;
  return map;
}

/**
 * The order of `readings` is the priority: the first source carrying a field wins, the rest
 * only fill gaps. Nothing is estimated — a field missing everywhere stays null.
 */
export function mergeReadings(readings: SourceReading[]): {
  fundamentals: Fundamentals;
  provenance: ProvenanceMap;
} {
  const fundamentals = emptyFundamentals();
  const provenance = emptyProvenance();

  for (const reading of readings) {
    for (const field of FUNDAMENTAL_FIELDS) {
      if (fundamentals[field] !== null) continue;
      const value = reading.fundamentals[field];
      if (value === null) continue;
      fundamentals[field] = value;
      provenance[field] = reading.derived.includes(field)
        ? { source: reading.source, derived: true }
        : { source: reading.source };
    }
  }

  return { fundamentals, provenance };
}
