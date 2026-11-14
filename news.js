import {
  NEWS_TOPICS, CALENDAR_COUNTRIES, calendarStatus, koreaDay, mergeHeadlines, safeNewsUrl, validateMarketNews,
} from './market-news-core.mjs';
import { compareIndicatorForecast } from './calendar-consensus-core.mjs';

const STATUS_LABELS = { upcoming: '발표 예정', pending: '결과 확인 중', released: '발표 완료' };
const FORECAST_LABELS = { above: '예측치 상회', equal: '예측치 부합', below: '예측치 하회' };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stamp(at) {
  if (!at || !Number.isFinite(Date.parse(at))) return '수집 자료 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(at));
}

function feedMessage(feed, label) {
  if (!feed.fetchedAt) return `${label} 수집 자료 없음`;
  const age = Date.now() - Date.parse(feed.fetchedAt);
  const delayed = feed.status !== 'ok' || age > 2 * 3600000;
  const suffix = delayed ? ' · 갱신 지연' : '';
  return `${label} ${stamp(feed.fetchedAt)} KST 수집${suffix}`;
}

export async function initNews() {
  const byId = id => document.getElementById(id);
  const status = byId('news-status');
  const refresh = byId('news-refresh');
  let data;
  let loading = false;
  let headlineLimit = 12;
  let calendarLimit = 8;
  let calendarView = 'upcoming';
  for (const topic of NEWS_TOPICS) byId('news-topic').append(new Option(topic, topic));

  function renderHeadlines() {
    const topic = byId('news-topic').value;
    const feed = byId('news-feed').value;
    const query = byId('news-search').value.trim().toLowerCase();
    const items = mergeHeadlines([...data.domestic.items, ...data.global.items]).filter(item =>
      (!topic || item.topic === topic) && (!feed || item.feed === feed)
      && (!query || `${item.title} ${item.source}`.toLowerCase().includes(query)));
    byId('headline-count').textContent = `${items.length}건`;
    byId('headline-freshness').textContent = [feedMessage(data.domestic, '국내'), feedMessage(data.global, '해외')].join(' / ');
    const list = byId('headline-list');
    list.replaceChildren();
    for (const item of items.slice(0, headlineLimit)) {
      const row = element('article', 'headline-row');
      const meta = element('div', 'headline-meta');
      const time = element('time', '', stamp(item.publishedAt));
      time.dateTime = item.publishedAt;
      meta.append(element('span', 'headline-topic', item.topic), element('span', '', item.source), time);
      const link = element('a', '', item.title + ' ↗');
      link.href = safeNewsUrl(item.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      row.append(meta, link);
      list.append(row);
    }
    if (!items.length) list.append(element('p', 'news-empty', '조건에 맞는 뉴스가 없습니다. 다른 분류나 검색어를 선택해 주세요.'));
    byId('headline-more').hidden = items.length <= headlineLimit;
  }

  function renderNext() {
    const next = data.calendar.items.filter(item => item.major && calendarStatus(item) === 'upcoming')
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '23:59').localeCompare(String(b.time || '23:59')))[0];
    byId('news-next-title').textContent = next ? `${CALENDAR_COUNTRIES[next.country]} · ${next.title}` : '확인된 다음 주요 발표가 없습니다';
    byId('news-next-detail').textContent = next
      ? `${next.date} ${next.time || '시각 미정'} KST${next.forecast ? ` · 예측 ${next.forecast}` : ''}${next.previous ? ` · 이전 ${next.previous}` : ''}`
      : '경제일정의 수집 시각과 갱신 상태를 확인해 주세요.';
  }

  function renderCalendar() {
    const country = byId('calendar-country').value;
    const major = byId('calendar-impact').value === 'major';
    const query = byId('calendar-search').value.trim().toLowerCase();
    const today = koreaDay();
    const items = data.calendar.items.filter(item => {
      const state = calendarStatus(item);
      const matchesView = calendarView === 'all' || (calendarView === 'released' ? state === 'released' : state !== 'released');
      return matchesView && (!country || item.country === country) && (!major || item.major)
        && (!query || item.title.toLowerCase().includes(query));
    }).sort((a, b) => {
      // In the upcoming view, past-due unconfirmed results follow future releases.
      if (calendarView === 'upcoming') {
        const aPending = calendarStatus(a) === 'pending';
        const bPending = calendarStatus(b) === 'pending';
        if (aPending !== bPending) return Number(aPending) - Number(bPending);
      }
      const order = a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || ''));
      return calendarView === 'released' ? -order : order;
    });
    const counts = { upcoming: 0, released: 0, pending: 0 };
    for (const item of data.calendar.items) {
      if ((!country || item.country === country) && (!major || item.major)) counts[calendarStatus(item)]++;
    }
    byId('calendar-summary').textContent = `예정 ${counts.upcoming} · 발표 완료 ${counts.released} · 결과 확인 중 ${counts.pending} / 검색 결과 ${items.length}건`;
    const freshness = byId('calendar-freshness');
    freshness.textContent = `${feedMessage(data.calendar, '경제일정')} · ${data.calendar.from || '—'} ~ ${data.calendar.to || '—'}`;
    if (data.calendar.consensus?.status === 'partial') freshness.textContent += ' · 예측치 일부 조회 지연';
    freshness.classList.toggle('is-warning', data.calendar.status !== 'ok' || Date.now() - Date.parse(data.calendar.fetchedAt) > 2 * 3600000);
    const list = byId('calendar-list');
    list.replaceChildren();
    let lastGroup;
    for (const item of items.slice(0, calendarLimit)) {
      const state = calendarStatus(item);
      const comparison = compareIndicatorForecast(item.actual, item.forecast);
      const group = item.date + (calendarView === 'upcoming' ? state : '');
      if (group !== lastGroup) {
        const dayLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' })
          .format(new Date(item.date + 'T12:00:00+09:00'));
        list.append(element('h3', 'calendar-date', `${dayLabel}${item.date === today ? ' · 오늘' : ''}${state === 'pending' ? ' · 결과 확인 중' : ''}`));
        lastGroup = group;
      }
      const row = element('article', 'calendar-event');
      const heading = element('div', 'calendar-event-head');
      const time = element('time', '', item.time || '미정');
      time.dateTime = item.scheduledAt || item.date;
      heading.append(time, element('h4', '', item.title));
      const meta = element('div', 'calendar-event-meta');
      meta.append(element('span', '', CALENDAR_COUNTRIES[item.country]), element('span', 'calendar-state ' + state, STATUS_LABELS[state]));
      if (item.major) meta.append(element('span', '', '주요 지표'));
      if (comparison) meta.append(element('span', 'forecast-comparison forecast-' + comparison, FORECAST_LABELS[comparison]));
      const values = element('dl', 'calendar-values');
      for (const [label, value] of [['발표', item.actual], ['예측치', item.forecast], ['이전', item.previous]]) {
        const cell = element('div');
        let className = value === null ? 'missing' : '';
        if (label === '발표' && comparison) className = 'forecast-' + comparison;
        cell.append(element('dt', '', label), element('dd', className, value ?? (label === '발표' && state !== 'released' ? '발표 대기' : '미제공')));
        values.append(cell);
      }
      row.append(heading, meta, values);
      if (item.change !== null) row.append(element('p', 'calendar-extra', `이전 대비 ${item.change}`));
      if (item.forecastSource === 'Nasdaq') {
        const source = element('p', 'calendar-extra');
        const link = element('a', '', '예측치 Nasdaq ↗');
        link.href = 'https://www.nasdaq.com/market-activity/economic-calendar';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        source.append(link, document.createTextNode(` · ${stamp(item.forecastFetchedAt)} KST 확인${item.forecastStale ? ' · 갱신 지연' : ''}`));
        row.append(source);
      }
      list.append(row);
    }
    if (!items.length) list.append(element('p', 'news-empty', data.calendar.status === 'unavailable'
      ? '경제일정을 가져오지 못했습니다. 자료를 다시 불러오거나 제공처 캘린더를 확인해 주세요.'
      : '조건에 맞는 경제지표가 없습니다. 국가·중요도·발표 상태를 바꿔 확인해 주세요.'));
    byId('calendar-more').hidden = items.length <= calendarLimit;
    renderNext();
  }

  async function load() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    status.textContent = '최신 배포 자료를 확인하고 있습니다.';
    try {
      const response = await fetch('./data/news.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('Snapshot unavailable');
      const snapshot = await response.json();
      if (!validateMarketNews(snapshot)) throw Error('Invalid snapshot');
      data = snapshot;
      const delayed = ['domestic', 'global', 'calendar'].some(key =>
        data[key].status !== 'ok' || Date.now() - Date.parse(data[key].fetchedAt) > 2 * 3600000);
      status.classList.toggle('is-warning', delayed);
      status.textContent = delayed
        ? '일부 자료의 갱신이 지연되고 있습니다. 마지막 확인 자료와 수집 시각을 표시합니다.'
        : `자료 확인 ${stamp(data.attemptedAt)} KST · 약 30분 간격 수집`;
      byId('news-content').hidden = false;
      renderHeadlines();
      renderCalendar();
    } catch {
      status.classList.add('is-warning');
      status.textContent = data
        ? '새 자료를 확인하지 못했습니다. 마지막으로 불러온 자료를 표시합니다.'
        : '뉴스 자료를 불러오지 못했습니다. 잠시 후 자료 다시 불러오기를 눌러 주세요.';
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  for (const id of ['news-topic', 'news-feed', 'news-search']) {
    byId(id).addEventListener(id === 'news-search' ? 'input' : 'change', () => {
      headlineLimit = 12;
      if (data) renderHeadlines();
    });
  }
  for (const id of ['calendar-country', 'calendar-impact', 'calendar-search']) {
    byId(id).addEventListener(id === 'calendar-search' ? 'input' : 'change', () => {
      calendarLimit = 8;
      if (data) renderCalendar();
    });
  }
  document.querySelectorAll('[data-calendar-view]').forEach(button => {
    button.onclick = () => {
      calendarView = button.dataset.calendarView;
      calendarLimit = 8;
      document.querySelectorAll('[data-calendar-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
      if (data) renderCalendar();
    };
  });
  byId('headline-more').onclick = () => { headlineLimit += 12; renderHeadlines(); };
  byId('calendar-more').onclick = () => { calendarLimit += 8; renderCalendar(); };
  refresh.onclick = load;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 5 * 60000);
  // Refresh time-dependent status even while a newer snapshot is being collected.
  setInterval(() => { if (data && !document.hidden) renderCalendar(); }, 60000);
  await load();
}
