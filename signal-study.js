import { SECTORS } from './sector-core.mjs';
import { ENTRY_LABELS } from './entry-types.mjs';
import { STUDY_COSTS, studySummary } from './signal-study-core.mjs';
import { validSignalManifest } from './signal-tools-publish.mjs';

const MARKET_LABELS = { KR: '한국', US: '미국', JP: '일본' };
const percent = value => value === null || !Number.isFinite(value) ? '—' : (value > 0 ? '+' : '') + value.toFixed(2) + '%';
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function initSignalStudy() {
  const root = document.getElementById('signal-study');
  if (!root) return;
  const byId = id => document.getElementById(id);
  let data, loading = false;
  for (const [id, label] of Object.entries(SECTORS)) byId('study-sector').append(new Option(label, id));
  for (const [id, label] of Object.entries(ENTRY_LABELS)) if (id !== 'unknown') byId('study-type').append(new Option(label, id));
  for (const [index, cost] of STUDY_COSTS.entries()) byId('study-cost').append(new Option(cost.label, String(index)));
  byId('study-cost').value = '1';

  function selectedGroups() {
    const from = byId('study-from').value, to = byId('study-to').value;
    if (from && to && from > to) return [];
    return data.groups.filter(group => (!from || group.month >= from) && (!to || group.month <= to)
      && (!byId('study-market').value || group.market === byId('study-market').value)
      && (!byId('study-sector').value || group.sector === byId('study-sector').value)
      && (!byId('study-type').value || group.type === byId('study-type').value)
      && (!byId('study-regime').value || group.regime === byId('study-regime').value));
  }

  function drawTable(host, labels, groups, key) {
    const body = byId(host);
    body.replaceChildren();
    for (const [value, label] of Object.entries(labels)) {
      const selected = groups.filter(group => group[key] === value);
      const summary = studySummary(selected, +byId('study-cost').value);
      if (!summary.signals) continue;
      const result = summary.results[2], row = node('tr');
      for (const text of [label, summary.signals.toLocaleString(), result.count.toLocaleString(), percent(result.mean),
        result.winRate === null ? '—' : result.winRate.toFixed(1) + '%',
        summary.path.count ? (summary.path.tp1 / summary.path.count * 100).toFixed(1) + '%' : '—',
        summary.path.count ? (summary.path.tp2 / summary.path.count * 100).toFixed(1) + '%' : '—']) row.append(node('td', text));
      if (result.count < 30) row.firstChild.append(node('small', '표본 30건 미만'));
      row.children[3].className = result.mean > 0 ? 'up' : result.mean < 0 ? 'down' : '';
      body.append(row);
    }
    if (!body.children.length) {
      const cell = node('td', '조건에 맞는 검증 표본이 없습니다.');
      cell.colSpan = 7;
      const row = node('tr'); row.append(cell); body.append(row);
    }
  }

  function draw() {
    if (!data) return;
    const groups = selectedGroups(), costIndex = +byId('study-cost').value;
    const summary = studySummary(groups, costIndex);
    byId('study-summary').textContent = `신호 ${summary.signals.toLocaleString()}건 · 다음 봉 진입 제외 ${summary.gapSkipped.toLocaleString()}건 · 다음 봉 미제공 ${summary.missingNext.toLocaleString()}건`;
    const horizonRows = byId('study-horizons'); horizonRows.replaceChildren();
    for (const result of summary.results) {
      const row = node('tr');
      for (const text of [`${result.horizon}봉`, result.count.toLocaleString(), result.pending.toLocaleString(), percent(result.mean),
        result.winRate === null ? '—' : result.winRate.toFixed(1) + '%', percent(result.meanMae), percent(result.worstMae)]) row.append(node('td', text));
      row.children[3].className = result.mean > 0 ? 'up' : result.mean < 0 ? 'down' : '';
      horizonRows.append(row);
    }
    byId('study-path').textContent = summary.path.count
      ? `20봉 완료 ${summary.path.count.toLocaleString()}건 · TP1 선행 도달 ${(summary.path.tp1 / summary.path.count * 100).toFixed(1)}% · TP2 선행 도달 ${(summary.path.tp2 / summary.path.count * 100).toFixed(1)}% · 초기 손절 접촉 ${(summary.path.stop / summary.path.count * 100).toFixed(1)}% · 동일 봉 순서 불명 ${summary.path.ambiguous.toLocaleString()}건`
      : '20봉이 완료된 경로 표본을 기다리고 있습니다.';
    drawTable('study-types', ENTRY_LABELS, groups, 'type');
    drawTable('study-markets', MARKET_LABELS, groups, 'market');
  }

  async function load() {
    if (loading) return;
    loading = true; byId('study-refresh').disabled = true;
    byId('study-status').textContent = '신호 검증 자료를 불러오고 있습니다.';
    try {
      const response = await fetch('./data/signal-study.json', { cache: 'no-store', signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw Error('Study data unavailable');
      const next = await response.json();
      if (!validSignalManifest(next) || !Array.isArray(next.groups) || next.status !== 'ok') throw Error('Study scan in progress');
      if (data && next.collectedAt < data.collectedAt) throw Error('Older study ignored');
      data = next;
      byId('study-from').min = data.fromMonth; byId('study-from').max = data.toMonth;
      byId('study-to').min = data.fromMonth; byId('study-to').max = data.toMonth;
      if (!byId('study-to').value) {
        byId('study-to').value = data.toMonth;
        const from = new Date(data.toMonth + '-01T00:00:00Z');
        from.setUTCMonth(from.getUTCMonth() - 5);
        byId('study-from').value = [data.fromMonth, from.toISOString().slice(0, 7)].sort().at(-1);
      }
      const age = Date.now() - Date.parse(data.collectedAt);
      byId('study-status').textContent = `${data.evaluatedCount.toLocaleString()} / ${data.universeCount.toLocaleString()}종목 분석 · ${data.failedCount.toLocaleString()}종목 자료 부족·조회 실패 · 검증 특수종목 제외 ${(data.excludedCount || 0).toLocaleString()}종목 · 수집 ${new Date(data.collectedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })} KST${age > 30 * 3600000 ? ' · 갱신 지연' : ''}`;
      byId('study-results').hidden = false;
      draw();
    } catch {
      byId('study-status').textContent = data ? '새 검증 자료 조회가 지연되어 마지막 자료를 표시합니다.' : '전체 종목의 신호 이력을 검사하고 있습니다. 완료 후 검증 통계가 표시됩니다.';
    } finally { loading = false; byId('study-refresh').disabled = false; }
  }
  for (const id of ['study-market', 'study-sector', 'study-type', 'study-regime', 'study-from', 'study-to', 'study-cost']) byId(id).addEventListener('change', draw);
  byId('study-refresh').onclick = load;
  document.querySelectorAll('[data-screen-view]').forEach(button => {
    button.onclick = () => {
      const study = button.dataset.screenView === 'study';
      document.querySelectorAll('[data-screen-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
      byId('screen-results-view').hidden = study;
      root.hidden = !study;
      if (study && !data) load();
    };
  });
}
