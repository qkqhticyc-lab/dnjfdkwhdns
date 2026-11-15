import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { plainNews } from '../stock-news-core.mjs';
import { koreaDay, shiftDay } from '../market-news-core.mjs';

const ROOT = '.cache/signal-tools';
const now = new Date().toISOString(), today = koreaDay(now), end = shiftDay(today, 7);
await mkdir(ROOT, { recursive: true });
let previous;
try { previous = JSON.parse(await readFile(ROOT + '/alert-calendar.json', 'utf8')); } catch { /* First collection. */ }
try {
  const response = await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/alert-calendar.json', { signal: AbortSignal.timeout(8000) });
  if (response.ok) {
    const candidate = await response.json();
    if (candidate.schemaVersion === 1 && Array.isArray(candidate.items) && (!previous || candidate.collectedAt > previous.collectedAt)) previous = candidate;
  }
} catch { /* Retain a local source timestamp. */ }

async function request(path, body) {
  const response = await fetch('https://stock.naver.com/api/marketCalendars/v1/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (InvestmentNote)' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Calendar HTTP ' + response.status);
  return response.json();
}

let result;
try {
  const scan = JSON.parse(await readFile('data/screener.json', 'utf8'));
  const identities = new Map();
  for (const stock of scan.items) {
    const product = stock.market === 'KR' ? 'domestic' : 'foreign';
    for (const code of new Set([stock.symbol, stock.providerSymbol])) {
      const key = product + ':' + code;
      const matches = identities.get(key) || [];
      matches.push(stock); identities.set(key, matches);
    }
  }
  const data = await request('events/search', { codes: [], from: today, to: end, category: 'earnings', myStocksOnly: false });
  if (!Array.isArray(data.dateGroups)) throw Error('Invalid earnings calendar');
  const items = new Map();
  for (const group of data.dateGroups) {
    if (!Array.isArray(group.events) || group.date < today || group.date > end) throw Error('Invalid earnings day');
    const events = [...group.events];
    if (group.hasNext) {
      const extra = await request('events/more', { codes: [], date: group.date, category: 'earnings', myStocksOnly: false });
      if (!Array.isArray(extra.events) || extra.hasNext) throw Error('Incomplete earnings day');
      events.push(...extra.events);
    }
    const unique = new Map(events.map(event => [event.eventKey, event]));
    if (unique.size < Number(group.totalCount)) throw Error('Truncated earnings day');
    for (const event of unique.values()) {
      const key = event.productKey?.productType + ':' + event.productKey?.itemCode;
      const matches = identities.get(key) || [];
      if (matches.length !== 1 || event.category !== 'earnings') continue;
      const stock = matches[0];
      items.set(event.eventKey, { id: plainNews(event.eventKey, 350), date: group.date, title: plainNews(event.title, 160),
        stock: { market: stock.market, symbol: stock.symbol, name: stock.name, currency: stock.currency, exchange: stock.exchange } });
    }
  }
  result = { schemaVersion: 1, status: 'ok', collectedAt: now, from: today, to: end, items: [...items.values()] };
} catch (error) {
  result = previous?.items ? { ...previous, status: 'stale', attemptedAt: now } : { schemaVersion: 1, status: 'unavailable', collectedAt: null, items: [] };
  console.log('Earnings calendar retaining previous data: ' + error.message);
}
await writeFile(ROOT + '/alert-calendar.json', JSON.stringify(result));
console.log(`Earnings calendar ${result.status}: ${result.items.length} mapped events`);
