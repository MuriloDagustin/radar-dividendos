import styles from './legend.module.css';

export function Legend() {
  return <section className={styles.legend} aria-label="Como usar a consulta">
    <span className="tag">dados e contexto</span>
    <h2 className={styles.heading}>Seus critérios, sua consulta.</h2>
    <div className={styles.notes}>
      <p>Escolha indicadores e limites na listagem. Sem limites preenchidos, todos os ativos da cobertura disponível são exibidos.</p>
      <p>Compare números, fontes e datas. Campos indisponíveis aparecem como “—”; não são estimados.</p>
      <p>Simulações são hipóteses aritméticas. Valores históricos e resultados de filtros não indicam adequação de um investimento.</p>
    </div>
  </section>;
}
