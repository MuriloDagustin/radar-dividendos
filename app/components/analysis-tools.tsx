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
    <div className={styles.grid}>{[
      { title: 'O que favorece', items: indicators.filter(i => i.signal === 'ok') },
      { title: 'O que exige atenção', items: indicators.filter(i => i.signal === 'warn' || i.signal === 'bad' || i.signal === 'unrel') },
      { title: 'O que falta verificar', items: indicators.filter(i => i.value === null && i.signal !== 'na') },
    ].map(group => <div key={group.title}><h3>{group.title}</h3>{group.items.length ? <ul>{group.items.map(i => <li key={i.key}>{i.label}: {i.message}</li>)}</ul> : <p>Nenhum ponto identificado nas regras disponíveis.</p>}</div>)}</div>
    <details><summary>Anotações e revisão pessoal</summary><label>Anotações<textarea value={note?.text ?? ''} onChange={e => updateLocal(d => ({ ...d, notes: { ...d.notes, [analysis.ticker]: { text: e.target.value, reviewedAt: null } } }))} /></label><button className={styles.button} onClick={() => updateLocal(d => ({ ...d, notes: { ...d.notes, [analysis.ticker]: { text: note?.text ?? '', reviewedAt: new Date().toISOString() } } }))}>Marcar revisão pessoal</button><p>{note?.reviewedAt ? `Revisado em ${formatTimestamp(note.reviewedAt)}. ` : ''}A revisão pessoal não altera os filtros automáticos.</p></details>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
