'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { Analysis } from '@/src/types';

const observation = z.object({ at: z.string(), verdict: z.enum(['solid', 'attention', 'fragile', 'indeterminate', 'inconclusive']), indicators: z.array(z.object({ key: z.string(), label: z.string(), value: z.number().nullable(), signal: z.enum(['ok', 'warn', 'bad', 'na', 'unrel']).nullable(), format: z.enum(['percent', 'currency', 'multiple', 'count']) })), payment: z.object({ date: z.string(), amount: z.number(), kind: z.string() }).nullable() });
const simulation = z.object({ id: z.string(), name: z.string(), href: z.string().regex(/^\/carteira\?papel=(fiis|acoes)&t=[A-Z0-9,]+$/), amount: z.string(), contribution: z.string(), mode: z.enum(['equal', 'quality', 'yield']), horizon: z.number().int().min(1).max(100), goal: z.string().default('1000'), yieldFactor: z.number().min(0).max(10).default(1), inflation: z.string().default('4') });
const schema = z.object({
  catalog: z.array(z.object({ ticker: z.string(), name: z.string().nullable() })).default([]),
  favorites: z.array(z.string()).default([]),
  observations: z.record(z.string(), z.array(observation)).default({}),
  positions: z.array(z.object({ ticker: z.string(), quantity: z.number().int().positive(), cost: z.number().nonnegative(), kind: z.enum(['stock', 'fii']), segment: z.string() })).default([]),
  notes: z.record(z.string(), z.object({ text: z.string(), reviewedAt: z.string().nullable() })).default({}),
  simulations: z.array(simulation).default([]),
  draft: simulation.omit({ id: true, name: true, href: true }).optional(),
});
export type LocalData = z.infer<typeof schema>;
export type Simulation = z.infer<typeof simulation>;
const KEY = 'radar-personal-v1';
const empty = schema.parse({});
let current = empty;
let hydrated = false;
let error = '';
const listeners = new Set<() => void>();
function read() {
  try { const raw = localStorage.getItem(KEY); current = raw ? schema.parse(JSON.parse(raw)) : empty; error = ''; }
  catch { error = 'Os dados locais estão inválidos ou indisponíveis. Nenhuma informação salva foi substituída.'; current = { ...current }; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hydrated) { hydrated = true; read(); }
  const sync = (event: StorageEvent) => { if (event.key === KEY || event.key === null) { read(); listeners.forEach(fn => fn()); } };
  window.addEventListener('storage', sync);
  return () => { listeners.delete(listener); window.removeEventListener('storage', sync); };
}
export function useLocalData() {
  const data = useSyncExternalStore(subscribe, () => current, () => empty);
  return { data, error, hydrated };
}
export function readLocalData() {
  if (!hydrated) { hydrated = true; read(); }
  return current;
}
export function updateLocal(update: (data: LocalData) => LocalData): boolean {
  if (!hydrated) { hydrated = true; read(); }
  if (error) { read(); if (error) return false; }
  const next = schema.parse(update(current));
  try { localStorage.setItem(KEY, JSON.stringify(next)); current = next; error = ''; }
  catch { error = 'Não foi possível salvar neste navegador. Verifique o espaço e as permissões de armazenamento.'; current = { ...current }; }
  listeners.forEach(fn => fn());
  return !error;
}
export function observeAnalysis(analysis: Analysis) {
  updateLocal(data => {
    const history = data.observations[analysis.ticker] ?? [];
    if (history.some(item => item.at === analysis.generatedAt)) return data;
    const payment = analysis.dividends?.nextPayment;
    const next = { at: analysis.generatedAt, verdict: analysis.diagnosis.verdict,
      indicators: analysis.diagnosis.indicators.filter(i => i.group === 'core').map(({ key, label, value, signal, format }) => ({ key, label, value, signal, format })),
      payment: payment?.paymentDate ? { date: payment.paymentDate, amount: payment.amount, kind: payment.kind } : null };
    return { ...data, observations: { ...data.observations, [analysis.ticker]: [...history, next].sort((a,b) => a.at.localeCompare(b.at)).slice(-20) } };
  });
}

/** Validate a backup before merging; existing local entries win on identity conflicts. */
export function importLocalBackup(raw: string): boolean {
  const imported = schema.parse(JSON.parse(raw));
  return updateLocal(d => ({
    ...d,
    favorites: [...new Set([...d.favorites, ...imported.favorites])],
    catalog: [...d.catalog, ...imported.catalog.filter(p => !d.catalog.some(v => v.ticker === p.ticker))],
    positions: [...d.positions, ...imported.positions.filter(p => !d.positions.some(v => v.ticker === p.ticker))],
    simulations: [...d.simulations, ...imported.simulations.filter(p => !d.simulations.some(v => v.id === p.id))],
    observations: { ...imported.observations, ...d.observations },
    notes: { ...imported.notes, ...d.notes },
  }));
}
