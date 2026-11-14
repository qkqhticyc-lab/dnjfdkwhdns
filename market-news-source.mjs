import { normalizeHeadline, mergeHeadlines, normalizeCalendarEvent, shiftDay, koreaDay } from './market-news-core.mjs';

const BASE = 'https://stock.naver.com';
const HEADERS = {
  'User-Agent': 'InvestmentNote/1.0 (https://qkqhticyc-lab.github.io/dnjfdkwhdns/)',
  'Content-Type': 'application/json',
};

async function sourceJson(path, body, fetcher) {
  const response = await fetcher(BASE + path, {
    headers: HEADERS,
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`News source HTTP ${response.status}`);
  return response.json();
}

export async function collectDomesticNews(now, fetcher = fetch) {
  const date = koreaDay(now).replaceAll('-', '');
  const query = new URLSearchParams({
    category: 'MAINNEWS', page: '1', pageSize: '100', date, enableFallback: 'true', maxDays: '3',
  });
  const data = await sourceJson('/api/domestic/news/list?' + query, null, fetcher);
  if (!Array.isArray(data.articles) || !data.articles.length) throw Error('Empty major news source');
  const items = mergeHeadlines(data.articles.map(row => normalizeHeadline(row, 'domestic', now)), now);
  if (!items.length) throw Error('No usable market headlines');
  return { items };
}

export async function collectGlobalNews(now, fetcher = fetch) {
  const rows = [];
  let cursor;
  // Two public pages provide a useful market selection without copying article bodies.
  for (let page = 0; page < 2; page++) {
    const query = new URLSearchParams({ size: '50' });
    if (cursor) query.set('cursor', cursor);
    const data = await sourceJson('/api/foreign/news/v1/foreign?' + query, null, fetcher);
    if (!Array.isArray(data.items)) throw Error('Invalid global news source');
    rows.push(...data.items);
    if (!data.hasNext || !data.cursor || data.cursor === cursor) break;
    cursor = data.cursor;
  }
  const items = mergeHeadlines(rows.map(row => normalizeHeadline(row, 'global', now)), now);
  if (!items.length) throw Error('No usable global market headlines');
  return { items };
}

export async function collectEconomicCalendar(now, fetcher = fetch) {
  const today = koreaDay(now);
  const from = shiftDay(today, -14);
  const to = shiftDay(today, 30);
  const request = { codes: [], from, to, category: 'economicIndicators', myStocksOnly: false };
  const data = await sourceJson('/api/marketCalendars/v1/events/search', request, fetcher);
  if (!Array.isArray(data.dateGroups) || !data.dateGroups.length) throw Error('Empty economic calendar');
  const items = new Map();
  for (const group of data.dateGroups) {
    if (!Array.isArray(group.events) || group.date < from || group.date > to) throw Error('Invalid calendar date group');
    const events = [...group.events];
    if (group.hasNext) {
      const extra = await sourceJson('/api/marketCalendars/v1/events/more', {
        codes: [], date: group.date, category: 'economicIndicators', myStocksOnly: false,
      }, fetcher);
      if (!Array.isArray(extra.events) || extra.hasNext) throw Error('Incomplete calendar day');
      events.push(...extra.events);
    }
    const unique = new Map(events.map(event => [event.eventKey, event]));
    if (unique.size < Number(group.totalCount)) throw Error('Truncated economic calendar day');
    for (const raw of unique.values()) {
      const event = normalizeCalendarEvent(raw, group.date);
      if (event) items.set(event.id, event);
    }
  }
  if (!items.size) throw Error('No usable economic events');
  return {
    from, to, countries: ['KOR', 'USA'],
    items: [...items.values()].sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)) || a.id.localeCompare(b.id)),
  };
}
