'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLocalData, updateLocal, type Simulation } from './local-store';
import styles from './personal.module.css';

export function SavedSimulations({ current, restore }: { current?: Omit<Simulation, 'id' | 'name'>; restore?: (simulation: Simulation) => void }) {
  const { data, error } = useLocalData();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  return <section className={styles.panel}><h2>Simulações salvas</h2>{current ? <form className={styles.toolbar} onSubmit={e => { e.preventDefault(); if (!name.trim()) return; if (updateLocal(d => ({ ...d, simulations: [...d.simulations, { ...current, id: crypto.randomUUID(), name: name.trim() }] }))) { setName(''); setMessage('Simulação salva neste navegador.'); } }}><label>Nome do cenário<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Cenário 1" /></label><button>Salvar cenário</button></form> : null}<p role="status">{message}</p>{data.simulations.length ? <ul>{data.simulations.map(sim => <li key={sim.id}><Link href={`${sim.href}&cenario=${sim.id}`} onClick={() => restore?.(sim)}>{sim.name}</Link> · {sim.horizon} anos <button className={styles.button} onClick={() => updateLocal(d => ({ ...d, simulations: d.simulations.filter(s => s.id !== sim.id) }))}>Excluir</button></li>)}</ul> : <p>Salve um cenário para retomar depois, com os mesmos valores e ativos.</p>}{error ? <p role="alert">{error}</p> : null}</section>;
}
