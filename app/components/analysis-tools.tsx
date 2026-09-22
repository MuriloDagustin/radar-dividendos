'use client';
import { useLocalData, updateLocal } from './local-store';
import type { Analysis } from '@/src/types';
import { formatTimestamp } from '@/app/format';
import styles from './personal.module.css';

export function AnalysisTools({ analysis }: { analysis: Analysis }) {
  const { data, error } = useLocalData();
  const favorite = data.favorites.includes(analysis.ticker);
  const indicators = analysis.diagnosis.indicators.filter(i => i.group === 'core');
  const note = data.notes[analysis.ticker];
  return <section className={styles.panel} aria-label={`Resumo de ${analysis.ticker}`}>
    <div className={styles.toolbar}><strong>{analysis.ticker}</strong><button aria-pressed={favorite} onClick={() => updateLocal(d => ({ ...d, favorites: favorite ? d.favorites.filter(t => t !== analysis.ticker) : [...d.favorites, analysis.ticker] }))}>{favorite ? '★ Nos favoritos' : '☆ Favoritar'}</button><span className={styles.muted}>Consulta: {formatTimestamp(analysis.generatedAt)}{analysis.fromCache ? ' · dados em cache' : ''}</span></div>
    <p>{indicators.filter(i => i.value !== null).length} de {indicators.length} indicadores com valores disponíveis. A consulta não atribui nota ao ativo.</p>
    <details><summary>Anotações e revisão pessoal</summary><label>Anotações<textarea value={note?.text ?? ''} onChange={e => updateLocal(d => ({ ...d, notes: { ...d.notes, [analysis.ticker]: { text: e.target.value, reviewedAt: null } } }))} /></label><button className={styles.button} onClick={() => updateLocal(d => ({ ...d, notes: { ...d.notes, [analysis.ticker]: { text: note?.text ?? '', reviewedAt: new Date().toISOString() } } }))}>Marcar revisão pessoal</button><p>{note?.reviewedAt ? `Revisado em ${formatTimestamp(note.reviewedAt)}. ` : ''}Suas anotações são pessoais e ficam neste navegador.</p></details>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
