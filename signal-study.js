import { SECTORS } from './sector-core.mjs';
import { ENTRY_LABELS } from './entry-types.mjs';
import { studySummary, STUDY_VERSION } from './signal-study-core.mjs';
import { validSignalManifest } from './signal-tools-publish.mjs';

const MARKET_LABELS = { KR: '한국', US: '미국', JP: '일본' };
const achievement = (result,key) => result.pathCount ? result[key+'Rate'].toFixed(1)+'% ('+result[key+'Count'].toLocaleString()+'건)' : result.count?'재집계 대기':'—';
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
      const summary = studySummary(selected);
      if (!summary.signals) continue;
      const result = summary.results[2], row = node('tr');
      for (const text of [label, summary.signals.toLocaleString(), result.pathCount.toLocaleString(), achievement(result,'tp1'),
        achievement(result,'tp2'),achievement(result,'stop'),result.ambiguous.toLocaleString()+'건']) row.append(node('td', text));
      if (result.count < 30) row.firstChild.append(node('small', '표본 30건 미만'));
      row.children[3].className = row.children[4].className = 'up';
      row.children[5].className = 'down';
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
    const groups = selectedGroups();
    const summary = studySummary(groups);
    byId('study-summary').textContent = `신호 ${summary.signals.toLocaleString()}건 · 다음 봉 진입 제외 ${summary.gapSkipped.toLocaleString()}건 · 다음 봉 미제공 ${summary.missingNext.toLocaleString()}건`;
    const horizonRows = byId('study-horizons'); horizonRows.replaceChildren();
    for (const result of summary.results) {
      const row = node('tr');
      for (const text of [`${result.horizon}봉`, result.pathCount.toLocaleString(), result.pending.toLocaleString(), achievement(result,'tp1'),
        achievement(result,'tp2'),achievement(result,'stop'),result.ambiguous.toLocaleString()+'건']) row.append(node('td', text));
      row.children[3].className = row.children[4].className = 'up';
      row.children[5].className = 'down';
      horizonRows.append(row);
    }
    byId('study-path').textContent = summary.results.some(result=>result.pathCount<result.count)
      ? '관찰 기간별 목표·손절 도달 이력을 다시 집계하고 있습니다. 재집계가 끝난 표본만 비율에 반영합니다.'
      : '각 비율의 분모는 전체 완료 표본입니다. TP1을 먼저 달성한 뒤 손절선에 닿은 신호는 손절 건수에서 제외합니다. 20봉 기준 제외 '+summary.results[2].stopAfterTp1Count.toLocaleString()+'건. TP2는 TP1에도 포함됩니다. TP1 선행을 확인할 수 없는 동일 봉 접촉은 손절 우선입니다.';
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
      if(next.studyVersion!==STUDY_VERSION){byId('study-status').textContent=data?'새 자료가 이전 집계 기준이어서 현재 통계를 유지합니다.':'TP1 이후 손절을 제외한 새 통계를 전체 종목에서 다시 계산하고 있습니다.';if(!data)byId('study-results').hidden=true;return;}
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
  for (const id of ['study-market', 'study-sector', 'study-type', 'study-regime', 'study-from', 'study-to']) byId(id).addEventListener('change', draw);
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
