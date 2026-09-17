'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useLocalData, updateLocal, importLocalBackup, type LocalData } from './local-store';
import { analysisHref } from '@/app/tickers';
import { formatValue, formatTimestamp, VERDICT_LABEL } from '@/app/format';
import type { Verdict } from '@/src/types';
import styles from './personal.module.css';

export function Personal() {
  const { data, error } = useLocalData();
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [kind, setKind] = useState<'stock' | 'fii'>('stock');
  const [segment, setSegment] = useState('');
  const [message, setMessage] = useState('');
  const [removed, setRemoved] = useState<LocalData['positions'][number] | null>(null);
  const tickers = [...new Set([...data.favorites, ...data.positions.map(p => p.ticker)])];
  function submit(event: FormEvent) {
    event.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    const q = Number(quantity.replace(',', '.')); const c = Number(cost.replace(',', '.'));
    if (!/^[A-Z]{4}\d{1,2}$/.test(symbol) || !Number.isSafeInteger(q) || q <= 0 || !cost.trim() || !Number.isFinite(c) || c < 0) { setMessage('Informe um ticker válido, quantidade inteira positiva e preço médio válido.'); return; }
    if (updateLocal(d => ({ ...d, positions: [...d.positions.filter(p => p.ticker !== symbol), { ticker: symbol, quantity: q, cost: c, kind, segment: segment.trim() }] }))) { setMessage(`${symbol}: posição salva.`); setTicker(''); setQuantity(''); setCost(''); setSegment(''); }
  }
  const invested = data.positions.reduce((sum, p) => sum + p.quantity * p.cost, 0);
  const segments = data.positions.reduce<Record<string, number>>((result, p) => { const key = p.segment || 'Sem setor informado'; result[key] = (result[key] ?? 0) + p.quantity * p.cost; return result; }, {});
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const payments = tickers.flatMap(t => {
    const observation = data.observations[t]?.at(-1); const p = observation?.payment;
    if (!p) return [];
    const parts = p.date.split('/'); const date = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : p.date;
    return [{ ticker: t, ...p, date, observed: observation.at }];
  }).filter(p => p.date >= today).sort((a,b) => a.date.localeCompare(b.date));
  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'meu-radar.json'; link.click(); URL.revokeObjectURL(url);
  }
  return <div className={styles.page}>
    <h1>Meu radar</h1><p>Favoritos, posições e revisões salvos neste navegador.</p>
    <div className={styles.toolbar}>{tickers.length ? <Link className={styles.button} href={analysisHref(tickers)}>Consultar meus ativos</Link> : null}<Link href="/carteira">Simular investimento</Link><button disabled={!!error} onClick={backup}>Exportar cópia local</button><label>Importar cópia<input type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 5_000_000) throw new Error('large'); const ok = importLocalBackup(await file.text()); setMessage(ok ? 'Cópia importada. Registros existentes foram preservados.' : 'Não foi possível salvar a cópia.'); } catch { setMessage('Arquivo inválido ou maior que 5 MB. Escolha uma cópia exportada pelo Radar.'); } }} /></label></div>
    <p className={styles.muted}>Os dados pessoais não são sincronizados entre dispositivos. Limpar o armazenamento do navegador remove essas informações.</p>
    {error ? <p role="alert">{error}</p> : null}
    <section className={styles.panel}><h2>Favoritos e mudanças</h2><form className={styles.toolbar} onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const t = String(new FormData(form).get('favorite')).trim().toUpperCase(); if (/^[A-Z]{4}\d{1,2}$/.test(t)) { updateLocal(d => ({ ...d, favorites: [...new Set([...d.favorites, t])] })); form.reset(); } }}><label>Ticker<input name="favorite" required pattern="[A-Za-z]{4}[0-9]{1,2}" placeholder="HGLG11" /></label><button>Adicionar favorito</button></form>
      {!data.favorites.length ? <p>Adicione um ticker ou marque a estrela na análise.</p> : <div className={styles.grid}>{data.favorites.map(t => {
        const history = data.observations[t] ?? []; const latest = history.at(-1); const previous = history.at(-2);
        const changes = latest && previous ? latest.indicators.filter(i => { const before = previous.indicators.find(p => p.key === i.key); return before && (before.value !== i.value || before.signal !== i.signal); }) : [];
        return <article key={t} className={styles.panel}><h3><Link href={analysisHref([t])}>{t}</Link></h3><p>{latest ? VERDICT_LABEL[latest.verdict as Verdict] : 'Aguardando primeira consulta'}</p>{latest ? <p className={styles.muted}>Consulta de {formatTimestamp(latest.at)}</p> : null}{previous ? <><p>Desde {formatTimestamp(previous.at)}:</p>{previous.verdict !== latest?.verdict ? <p>Diagnóstico: {VERDICT_LABEL[previous.verdict as Verdict]} → {VERDICT_LABEL[latest!.verdict as Verdict]}</p> : null}{changes.length ? <ul>{changes.map(i => <li key={i.key}>{i.label}: {formatValue(previous.indicators.find(p => p.key === i.key)!.value, i.format)} → {formatValue(i.value, i.format)}{previous.indicators.find(p => p.key === i.key)?.signal !== i.signal ? ' · faixa alterada' : ''}</li>)}</ul> : <p>Indicadores sem mudanças na última consulta.</p>}</> : <p>Consulte novamente após a atualização dos dados para acompanhar mudanças.</p>}<button className={styles.button} onClick={() => updateLocal(d => ({ ...d, favorites: d.favorites.filter(f => f !== t) }))}>Remover favorito</button></article>;
      })}</div>}
    </section>
    <section className={styles.panel}><h2>Minha carteira</h2><p>Cadastre a posição total de cada ativo. Salvar um ticker existente substitui sua quantidade e preço médio.</p>
      <form className={styles.toolbar} onSubmit={submit}><label>Ticker<input required value={ticker} onChange={e => setTicker(e.target.value)} placeholder="TAEE11" /></label><label>Quantidade<input required inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Preço médio (R$)<input required inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} /></label><label>Tipo<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="stock">Ação</option><option value="fii">FII</option></select></label><label>Setor ou segmento<input value={segment} onChange={e => setSegment(e.target.value)} /></label><button>Salvar posição</button></form><p role="status">{message}</p>{removed ? <p>Posição de {removed.ticker} removida. <button className={styles.button} onClick={() => { if (updateLocal(d => ({ ...d, positions: [...d.positions.filter(p => p.ticker !== removed.ticker), removed] }))) setRemoved(null); }}>Desfazer</button></p> : null}
      <p>Custo total registrado: <strong>{formatValue(invested, 'currency')}</strong></p>
      {data.positions.length ? <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Ativo</th><th>Tipo</th><th>Quantidade</th><th>Preço médio</th><th>Custo</th><th>Ações</th></tr></thead><tbody>{data.positions.map(p => <tr key={p.ticker}><td><Link href={analysisHref([p.ticker])}>{p.ticker}</Link></td><td>{p.kind === 'fii' ? 'FII' : 'Ação'}</td><td>{p.quantity}</td><td>{formatValue(p.cost, 'currency')}</td><td>{formatValue(p.cost * p.quantity, 'currency')}</td><td><button className={styles.button} onClick={() => { setTicker(p.ticker); setQuantity(String(p.quantity)); setCost(String(p.cost)); setKind(p.kind); setSegment(p.segment); }}>Editar</button> <button className={styles.button} onClick={() => { if (updateLocal(d => ({ ...d, positions: d.positions.filter(v => v.ticker !== p.ticker) }))) setRemoved(p); }}>Remover</button></td></tr>)}</tbody></table></div> : <p>Nenhuma posição cadastrada. Ações e FIIs podem ficar na mesma carteira.</p>}
      {invested > 0 ? <><h3>Concentração por custo de aquisição</h3><ul>{Object.entries(segments).map(([name, value]) => <li key={name}>{name}: {formatValue(value / invested, 'percent')}</li>)}</ul></> : null}
    </section>
    <section className={styles.panel}><h2>Calendário de proventos</h2><p>Próximos pagamentos publicados nas últimas consultas dos seus ativos. Valores por ação/cota; a quantidade elegível na data-base não foi registrada.</p>{payments.length ? <ul>{payments.map(p => <li key={`${p.ticker}-${p.date}`}>{p.date.split('-').reverse().join('/')} · <Link href={analysisHref([p.ticker])}>{p.ticker}</Link> · {formatValue(p.amount, 'currency')} por unidade · {p.kind} <span className={styles.muted}>(consulta: {formatTimestamp(p.observed)})</span></li>)}</ul> : <p>Nenhum próximo pagamento disponível nas consultas salvas. Consulte seus ativos para atualizar.</p>}</section>
    <section className={styles.panel}><h2>Revisões e pendências</h2>{tickers.length ? tickers.map(t => { const latest = data.observations[t]?.at(-1); const missing = latest?.indicators.filter(i => i.value === null && i.signal !== 'na') ?? []; return <div key={t}><h3><Link href={analysisHref([t])}>{t}</Link></h3><p>{missing.length ? `Conferir: ${missing.map(i => i.label).join(', ')}.` : latest ? 'Sem indicadores ausentes na última consulta.' : 'Primeira consulta pendente.'}</p><p>{data.notes[t]?.text || 'Sem anotações.'}</p><p className={styles.muted}>{data.notes[t]?.reviewedAt ? `Revisão pessoal: ${formatTimestamp(data.notes[t].reviewedAt!)}` : 'Ainda não revisado pessoalmente'}</p></div>; }) : <p>Adicione ativos para acompanhar as pendências.</p>}</section>
  </div>;
}
