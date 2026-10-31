const $ = id => document.getElementById(id);
const sections = {
  targets: { kicker: 'TARGET PRICE', title: '목표주가 변동', description: '국내 증권사 종목 리포트 · 같은 증권사의 이전 목표주가와 비교', filters: [['all', '전체'], ['up', '상향'], ['down', '하향'], ['same', '유지'], ['unknown', '비교 불가']] },
  earnings: { kicker: 'EARNINGS REVIEW', title: '실적 발표와 종목 리뷰', description: '최근 발행된 증권사 실적 리뷰 · 수치가 확인된 보고서는 영업이익도 함께 표시', filters: [['all', '전체'], ['profit', '영업이익 확인'], ['growth', '전년 대비 증가']] },
  overseas: { kicker: 'GLOBAL RESEARCH', title: '해외주식 리포트', description: '국내 증권사가 발행한 해외 종목 · 산업 · 시황 보고서', filters: [['all', '전체'], ['stock', '종목'], ['market', '산업·시황'], ['review', '실적 리뷰'], ['preview', '실적 프리뷰']] },
};
const money = value => Number.isFinite(value) && value > 0 ? new Intl.NumberFormat('ko-KR').format(value) + '원' : '미제시';
const percent = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : '—';
const time = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '아직 수집되지 않음';
function el(tag, text, className) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; }
function link(url, text, className = '') {
  let valid;
  try { const u = new URL(url); valid = u.protocol === 'https:' && ['stock.naver.com', 'rreport.einfomax.co.kr'].includes(u.hostname); } catch {}
  if (!valid) return el('span', text, className);
  const a = el('a', text, className); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function selectKind(item, kind) {
  if (kind === 'all') return true;
  if (kind === 'profit') return !!item.profit;
  if (kind === 'growth') return item.profit?.yoyPercent > 0;
  if (kind === 'review') return item.kind === '실적 리뷰';
  if (kind === 'preview') return item.kind === '실적 프리뷰';
  return item.direction === kind || item.category === kind;
}
let data, active = 'targets', kind = 'all', date = '', query = '', limit = 30;
function scopeRows() { return (data?.[active]?.items || []).filter(item => (!date || item.date === date) && (!query || [item.company, item.symbol, item.broker, item.title].join(' ').toLocaleLowerCase().includes(query))); }
function row(item) {
  const article = el('article', null, `research-row ${active === 'earnings' ? 'earnings-row' : ''}`);
  const identity = el('div', null, 'report-identity');
  identity.append(el('strong', item.company || (item.category === 'market' ? '산업·시황' : '종목 보고서')));
  if (item.symbol) identity.append(el('span', item.symbol, 'report-symbol'));
  identity.append(el('small', `${item.broker || '증권사 미표시'}${item.opinion ? ' · ' + item.opinion : ''}`));
  article.append(identity);
  const headline = el('div', null, 'report-headline');
  headline.append(link(item.url, item.title || '보고서 원문', 'report-title'));
  headline.append(el('small', `${item.date}${item.period ? ' · ' + item.period : ''}${item.kind ? ' · ' + item.kind : ''}`));
  article.append(headline);
  if (active === 'targets') {
    const price = el('div', null, 'report-price');
    price.append(el('small', item.previousTarget ? `${money(item.previousTarget)} →` : '이전 목표가 미확인'), el('strong', money(item.targetPrice)));
    const change = el('div', null, `report-change ${['up', 'down', 'same'].includes(item.direction) ? item.direction : ''}`);
    change.append(el('strong', percent(item.changePercent)), el('small', { up: '상향', down: '하향', same: '유지', unknown: '비교 불가' }[item.direction] || '비교 불가'));
    if (Math.abs(item.changePercent) >= 100) change.append(el('small', '변동폭 원문 확인', 'review-value'));
    article.append(price, change);
  } else if (active === 'earnings') {
    const metric = el('div', null, 'report-metric');
    if (item.profit && Number.isFinite(item.profit.amount)) {
      metric.append(el('span', '영업이익 '), el('strong', `${new Intl.NumberFormat('ko-KR').format(item.profit.amount)}${item.profit.unit}`));
      if (Number.isFinite(item.profit.yoyPercent)) metric.append(el('span', `전년 대비 ${percent(item.profit.yoyPercent)}`, item.profit.yoyPercent > 0 ? 'up' : 'down'));
    } else metric.append(el('span', '실적 수치는 원문에서 확인'));
    article.append(metric, link(item.url, '보고서 열기 ↗', 'report-open'));
  } else {
    const type = el('div', null, 'report-type'); type.append(el('span', item.category === 'stock' ? '종목 리포트' : '산업·시황', 'research-badge'));
    if (item.author) type.append(el('small', item.author));
    article.append(type, link(item.url, '원문 PDF ↗', 'report-open'));
  }
  return article;
}
function render() {
  const section = sections[active], feed = data?.[active];
  $('research-kicker').textContent = section.kicker;
  $('research-title').textContent = section.title;
  $('research-description').textContent = section.description;
  $('research-updated').textContent = `마지막 수집 ${time(feed?.updatedAt)} (한국 시간) · 30분 간격 갱신`;
  document.querySelectorAll('[data-research-tab]').forEach(button => {
    const selected = button.dataset.researchTab === active; button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-active', selected);
  });
  const scoped = scopeRows();
  const filters = $('research-filters'); filters.replaceChildren();
  for (const [value, label] of section.filters) {
    const button = el('button', `${label} ${scoped.filter(item => selectKind(item, value)).length}`, `research-chip ${value}`);
    button.type = 'button'; button.setAttribute('aria-pressed', String(value === kind));
    button.onclick = () => { kind = value; limit = 30; render(); }; filters.append(button);
  }
  const rows = scoped.filter(item => selectKind(item, kind));
  const list = $('research-list'); list.replaceChildren();
  if (!rows.length) list.append(el('p', feed?.items?.length ? '조건에 맞는 리포트가 없습니다. 날짜나 검색어를 바꿔보세요.' : '아직 가져온 자료가 없습니다. 다음 갱신 때 다시 확인해 주세요.', 'research-empty'));
  else for (const item of rows.slice(0, limit)) list.append(row(item));
  $('research-result-count').textContent = `${rows.length}건 중 ${Math.min(limit, rows.length)}건 표시`;
  $('research-more').hidden = rows.length <= limit;
  const latest = [...new Set(feed?.items?.map(item => item.date) || [])].sort().at(-1);
  $('research-summary').textContent = active === 'targets'
    ? `${date || '수집 기간 전체'} · 상향 ${scoped.filter(r => r.direction === 'up').length} / 하향 ${scoped.filter(r => r.direction === 'down').length} / 유지 ${scoped.filter(r => r.direction === 'same').length}. 이전 값이 없는 보고서는 비교하지 않습니다.`
    : active === 'earnings' ? '발행일 최신순 · 증권사 발행 보고서의 실적 리뷰입니다. 영업이익 증감률은 전년 동기 비교가 확인된 경우에만 표시합니다.'
      : '발행일 최신순 · 종목명·티커·증권사·제목으로 검색하세요. 각 보고서의 목표주가는 원문에서 확인할 수 있습니다.';
  const warning = $('research-warning');
  const age = feed?.updatedAt ? Date.now() - Date.parse(feed.updatedAt) : Infinity;
  warning.hidden = feed?.status === 'ok' && age < 2 * 3600000;
  warning.textContent = feed?.message || (age >= 2 * 3600000 ? '자료 갱신이 지연되고 있습니다. 아래 마지막 수집 시각을 확인해 주세요.' : '일부 자료를 확인하지 못했습니다.');
  $('research-source').textContent = `${active === 'overseas' ? '출처: 연합인포맥스 · 각 증권사' : '출처: 네이버페이 증권 리서치 · 각 증권사'} · 최근 발행일 ${latest || '—'}. 수집 범위 안의 보고서만 표시합니다.`;
}
function switchSection(value) {
  active = value; kind = 'all'; limit = 30;
  const days = [...new Set(data?.[active]?.items?.map(item => item.date) || [])].sort().reverse();
  date = days[0] || '';
  const select = $('research-date'); select.replaceChildren();
  for (const day of days) { const option = el('option', day); option.value = day; select.append(option); }
  const all = el('option', '수집 기간 전체'); all.value = ''; select.append(all); select.value = date;
  render();
}
export async function initResearch() {
  document.querySelectorAll('[data-research-tab]').forEach(button => { button.onclick = () => switchSection(button.dataset.researchTab); });
  $('research-search').oninput = event => { query = event.target.value.trim().toLocaleLowerCase(); limit = 30; if (data) render(); };
  $('research-date').onchange = event => { date = event.target.value; limit = 30; if (data) render(); };
  $('research-more').onclick = () => { limit += 30; render(); };
  $('research-retry').onclick = load;
  async function load() {
    $('research-retry').disabled = true;
    try {
      const response = await fetch('./data/research.json', { cache: 'no-store' });
      if (!response.ok) throw Error('Research data unavailable');
      const next = await response.json();
      if (next.schemaVersion !== 1 || !Object.keys(sections).every(key => Array.isArray(next[key]?.items))) throw Error('Invalid research data');
      data = next;
      for (const key of Object.keys(sections)) $(`research-count-${key}`).textContent = `${data[key].items.length}건 수집`;
      $('research-loading').hidden = true;
      $('research-content').hidden = false;
      switchSection(active);
    } catch {
      $('research-loading').hidden = false;
      $('research-loading').textContent = '리포트를 불러오지 못했습니다. 잠시 후 다시 불러오기를 눌러 주세요.';
    } finally { $('research-retry').disabled = false; }
  }
  await load();
}
