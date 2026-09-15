import { CATEGORY_NAME, DISCLAIMER, SOURCE_NAME } from './types';

export const PAGE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar de Dividendos</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #12161c;
    --panel: #1a1f27;
    --border: #2b323d;
    --text: #e6e9ee;
    --muted: #939cab;
    --ok: #4ec98b;
    --warn: #e8b13a;
    --bad: #ef6a6a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1rem; background: var(--bg); color: var(--text);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  p.sub { color: var(--muted); margin: 0 0 1.5rem; font-size: .9rem; }
  form { display: flex; gap: .5rem; margin-bottom: 1.5rem; }
  input, button {
    font: inherit; padding: .6rem .8rem; border-radius: 8px;
    border: 1px solid var(--border); background: var(--panel); color: var(--text);
  }
  input { flex: 1; text-transform: uppercase; }
  button { cursor: pointer; font-weight: 600; }
  button:disabled { opacity: .5; cursor: progress; }
  .card {
    border: 1px solid var(--border); border-radius: 12px; background: var(--panel);
    padding: 1rem 1.1rem; margin-bottom: 1rem;
  }
  .header { display: flex; align-items: baseline; gap: .75rem; margin-bottom: .75rem; }
  .header strong { font-size: 1.15rem; letter-spacing: .04em; }
  .badge { font-size: .75rem; font-weight: 700; letter-spacing: .08em; padding: .2rem .5rem; border-radius: 999px; }
  .badge.solid { background: rgba(78,201,139,.15); color: var(--ok); }
  .badge.attention { background: rgba(232,177,58,.15); color: var(--warn); }
  .badge.fragile  { background: rgba(239,106,106,.15); color: var(--bad); }
  .badge.indeterminate { background: rgba(147,156,171,.15); color: var(--muted); }
  .badge.inconclusive  { background: rgba(180,154,224,.15); color: #b49ae0; }
  .notes { margin: .5rem 0 .75rem; display: grid; gap: .3rem; }
  .notes div { font-size: .8rem; color: var(--muted); border-left: 2px solid var(--border); padding-left: .5rem; }
  .screen { margin: .5rem 0 .9rem; padding: .6rem .75rem; border: 1px solid var(--border); border-radius: 8px; }
  .screen h3 { margin: 0 0 .3rem; font-size: .8rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .screen h3 span { text-transform: none; letter-spacing: 0; font-weight: 400; margin-left: .5rem; }
  .screen ol, .screen ul { margin: 0; padding: 0; list-style: none; }
  .screen li { padding: .3rem 0; border-bottom: 1px dotted var(--border); font-size: .85rem; }
  .screen li:last-child { border-bottom: 0; }
  .screen .mark { display: inline-block; width: 1.2rem; font-weight: 700; }
  .screen .detail { display: block; color: var(--muted); font-size: .78rem; }
  .screen .value { float: right; color: var(--muted); font-variant-numeric: tabular-nums; }
  .screen .locked { opacity: .6; }
  .pass { color: var(--ok); } .fail { color: var(--bad); } .unknown { color: var(--muted); }
  .context { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: .3rem .9rem; margin-top: .75rem; padding-top: .6rem; border-top: 1px solid var(--border); font-size: .78rem; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  td { padding: .35rem 0; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td.label { font-weight: 600; white-space: nowrap; }
  td.value { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: .75rem; }
  td.msg { padding-left: .75rem; }
  .ok { color: var(--ok); } .warn { color: var(--warn); } .bad { color: var(--bad); }
  .unrel { color: #b49ae0; }
  .na, .none { color: var(--muted); }
  .meta { color: var(--muted); font-size: .78rem; }
  .ai { margin-top: .9rem; padding-top: .9rem; border-top: 1px solid var(--border); }
  .ai ul { margin: .5rem 0 0; padding-left: 1.1rem; color: var(--warn); }
  .error { border-color: var(--bad); color: var(--bad); }
  footer { color: var(--muted); font-size: .8rem; margin-top: 2rem; border-top: 1px solid var(--border); padding-top: 1rem; }
</style>
</head>
<body>
<main>
  <h1>Radar de Dividendos</h1>
  <p class="sub">Fundamentos da B3 com diagnóstico determinístico. Fontes: brapi.dev, Investidor10, StatusInvest e Fundamentus.</p>

  <form id="form">
    <input id="ticker" name="ticker" placeholder="TAEE11" autocomplete="off" required
           pattern="[A-Za-z]{4}[0-9]{1,2}" title="4 letras seguidas de 1 ou 2 dígitos">
    <button type="submit">Analisar</button>
  </form>

  <div id="saida"></div>

  <footer>${DISCLAIMER}</footer>
</main>

<script type="module">
const form = document.getElementById('form');
const field = document.getElementById('ticker');
const output = document.getElementById('saida');
const button = form.querySelector('button');

const VERDICT_LABEL = { solid: 'Sólida', attention: 'Atenção', fragile: 'Frágil', indeterminate: 'Sem dados', inconclusive: 'Inconclusivo' };
const SOURCE_NAME = ${JSON.stringify(SOURCE_NAME)};
const CATEGORY_NAME = ${JSON.stringify(CATEGORY_NAME)};
const sourceName = (s) => SOURCE_NAME[s] ?? s;

const esc = (v) => String(v).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const nf = (min, max) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: min, maximumFractionDigits: max,
});

function formatValue(value, format) {
  if (value === null || value === undefined) return '—';
  if (format === 'percent') return nf(1, 1).format(value * 100) + '%';
  if (format === 'currency') {
    const abs = Math.abs(value);
    if (abs >= 1e9) return 'R$ ' + nf(2, 2).format(value / 1e9) + ' bi';
    if (abs >= 1e6) return 'R$ ' + nf(2, 2).format(value / 1e6) + ' mi';
    return 'R$ ' + nf(2, 2).format(value);
  }
  return nf(2, 2).format(value);
}

function provenanceOf(analysis, key) {
  if (key === 'netDebtToEbitda') {
    const direct = analysis.provenance.netDebtToEbitda;
    if (direct) return sourceName(direct.source);
    const parts = ['netDebt', 'ebitda']
      .map((f) => analysis.provenance[f]).filter(Boolean);
    if (!parts.length) return '';
    return [...new Set(parts.map((p) => sourceName(p.source)))].join(' + ') + ', calculado';
  }
  const p = analysis.provenance[key];
  if (!p) return '';
  return sourceName(p.source) + (p.derived ? ', derivado' : '');
}

function render(analysis) {
  const latest = analysis.filings?.latest;
  const documentLink = latest
    ? \` <a href="\${esc(latest.reportUrl ?? latest.statementsUrl ?? analysis.filings.indexUrl)}" target="_blank" rel="noopener noreferrer">ver documentos de resultado (\${esc(latest.period)})</a>\`
    : '';

  const rows = analysis.diagnosis.indicators.filter((i) => i.group !== 'context').map((i) => {
    const cls = i.signal ?? 'none';
    const prov = provenanceOf(analysis, i.key);
    return \`<tr>
      <td class="label">\${esc(i.label)}</td>
      <td class="value \${cls}">\${esc(formatValue(i.value, i.format))}</td>
      <td class="msg \${cls}">\${esc(i.message)}\${i.signal === 'unrel' ? documentLink : ''}\${prov ? \` <span class="meta">[\${esc(prov)}]</span>\` : ''}</td>
    </tr>\`;
  }).join('');

  const context = analysis.diagnosis.indicators
    .filter((i) => i.group === 'context' && i.value !== null)
    .map((i) => \`<div>\${esc(i.label)}: <strong>\${esc(formatValue(i.value, i.format))}</strong></div>\`)
    .join('');

  const sourceNotes = analysis.sources.filter((f) => f.detail)
    .map((f) => \`<div class="meta">\${esc(sourceName(f.source))} \${f.status === 'failed' ? 'fora' : 'ressalva'} — \${esc(f.detail ?? '')}</div>\`)
    .join('');

  const ia = analysis.interpretation ? \`<div class="ai">
      <strong>Leitura por IA</strong> <span class="meta">(\${esc(analysis.interpretation.model)})</span>
      <p>\${esc(analysis.interpretation.summary)}</p>
      <ul>\${analysis.interpretation.watchPoints.map((p) => \`<li>\${esc(p)}</li>\`).join('')}</ul>
    </div>\` : '';

  const companyNotes = (analysis.notes ?? [])
    .map((n) => \`<div>\${esc(n)}</div>\`).join('');

  const MARK = { pass: '✓', fail: '✕', unknown: '?' };
  const criterion = (c, i) => \`<li><span class="mark \${esc(c.status)}">\${MARK[c.status] ?? '?'}</span>
      <strong>\${i !== undefined ? i + 1 + '. ' : ''}\${esc(c.label)}</strong>
      \${c.value ? \`<span class="value">\${esc(c.value)}</span>\` : ''}
      <span class="detail">\${esc(c.detail)}</span></li>\`;
  const s = analysis.fundScreen ?? analysis.stockScreen;
  const paper = analysis.fundScreen ? 'fundos' : 'ações';
  const screen = s ? \`<div class="screen">
      <h3>5 filtros <span class="\${s.passedAll ? 'pass' : ''}">\${s.passedAll
        ? 'Passou nos ' + s.filters.length + ' filtros'
        : 'Passou em ' + s.passed + ' de ' + s.filters.length + ' filtros' + (s.unknown ? ' · ' + s.unknown + ' sem dado' : '')}</span></h3>
      <ol>\${s.filters.map(criterion).join('')}</ol>
      <div class="\${s.passedAll ? '' : 'locked'}">
        <h3 style="margin-top:.6rem">Desempate <span>\${s.passedAll ? 'entre ' + paper + ' que passaram nos 5 filtros' : 'só vale depois de passar pelos 5 filtros'}</span></h3>
        <ul>\${s.tiebreakers.map((c) => criterion(c)).join('')}</ul>
      </div>
    </div>\` : '';

  const category = analysis.classification?.category;
  const kindLabel = analysis.kind === 'fii' || category === 'fii'
    ? 'FII'
    : 'ação · ' + (CATEGORY_NAME[category] ?? '');

  const v = analysis.diagnosis.verdict;
  output.innerHTML = \`<div class="card">
    <div class="header">
      <strong>\${esc(analysis.ticker)}</strong>
      <span class="badge \${esc(v)}">\${esc(VERDICT_LABEL[v] ?? v)}</span>
      <span class="meta">\${esc(kindLabel)}</span>\${documentLink}
      <span class="meta">\${analysis.fromCache ? 'do cache' : 'consulta ao vivo'} ·
        \${esc(new Date(analysis.generatedAt).toLocaleString('pt-BR'))}</span>
    </div>
    \${companyNotes ? \`<div class="notes">\${companyNotes}</div>\` : ''}
    \${screen}
    <table>\${rows}</table>
    \${context ? \`<div class="context">\${context}</div>\` : ''}
    \${sourceNotes}
    \${ia}
  </div>\`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const ticker = field.value.trim().toUpperCase();
  if (!ticker) return;

  button.disabled = true;
  output.innerHTML = '<div class="card meta">Consultando as fontes…</div>';

  try {
    const response = await fetch(\`/api/analise/\${encodeURIComponent(ticker)}\`);
    const body = await response.json();
    if (!response.ok) {
      output.innerHTML = \`<div class="card error">\${esc(body.erro ?? 'Falha na consulta.')}</div>\`;
      return;
    }
    render(body);
  } catch (error) {
    output.innerHTML = \`<div class="card error">\${esc(error.message ?? 'Falha de rede.')}</div>\`;
  } finally {
    button.disabled = false;
  }
});
</script>
</body>
</html>`;
