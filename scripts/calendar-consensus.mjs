import { readFile, writeFile } from 'node:fs/promises';
import { CONSENSUS_NAMES, matchCalendarConsensus } from '../calendar-consensus-core.mjs';
import { shiftDay } from '../market-news-core.mjs';

const CACHE = '.cache/news/consensus-days.json';
const SOURCE_URL = 'https://www.nasdaq.com/market-activity/economic-calendar';

export function consensusQueryDay(event) {
  const localDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(event.scheduledAt));
  // Nasdaq's date-only API query resolves to the preceding New York session.
  // Its row times are New York wall times, including the seasonal UTC offset.
  return shiftDay(localDay, 1);
}

export async function enrichCalendarConsensus(calendar, previous, now, fetcher = fetch, cache = {}) {
  const attemptedAt = new Date(now).toISOString();
  const dates = [...new Set(calendar.items.filter(item => CONSENSUS_NAMES[item.code] && item.scheduledAt).map(consensusQueryDay))];
  const days = new Map();
  let failures = 0;
  for (let index = 0; index < dates.length; index += 3) {
    const batch = dates.slice(index, index + 3);
    const results = await Promise.allSettled(batch.map(async date => {
      const cached = cache[date];
      const historical = Date.parse(date + 'T00:00:00Z') < now - 2 * 86400000;
      if (historical && Array.isArray(cached?.rows) && now - Date.parse(cached.fetchedAt) < 3 * 3600000) return cached;
      const response = await fetcher('https://api.nasdaq.com/api/calendar/economicevents?date=' + date, {
        headers: { 'User-Agent': 'Mozilla/5.0 (InvestmentNote)' }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error(`Consensus HTTP ${response.status}`);
      const data = await response.json();
      if (data.status?.rCode !== 200 || !Array.isArray(data.data?.rows)) throw Error('Invalid consensus source');
      const rows = data.data.rows.filter(row => ['United States', 'South Korea'].includes(row.country))
        .map(({ country, gmt, eventName, actual, consensus, previous }) => ({ country, gmt, eventName, actual, consensus, previous }));
      return { fetchedAt: attemptedAt, rows };
    }));
    for (const [offset, result] of results.entries()) {
      const date = batch[offset];
      if (result.status === 'fulfilled') {
        days.set(date, result.value);
        cache[date] = result.value;
      } else {
        failures++;
      }
    }
  }
  const oldItems = new Map((previous?.items || []).map(item => [item.id, item]));
  const items = calendar.items.map(item => {
    if (item.forecast !== null) return item;
    const day = item.scheduledAt && days.get(consensusQueryDay(item));
    const match = day && matchCalendarConsensus(item, day.rows);
    if (match) return {
      ...item, ...match, previous: item.previous ?? match.previous,
      forecastSource: 'Nasdaq', forecastUrl: SOURCE_URL, forecastFetchedAt: day.fetchedAt, forecastStale: false,
    };
    const old = oldItems.get(item.id);
    // Keep an already verified release forecast through missing rows and actual revisions.
    if (old?.forecastSource === 'Nasdaq' && old.forecast !== null && old.code === item.code && old.scheduledAt === item.scheduledAt) return {
      ...item, forecast: old.forecast, forecastSource: old.forecastSource, forecastUrl: old.forecastUrl,
      previous: item.previous ?? old.previous, forecastFetchedAt: old.forecastFetchedAt, forecastStale: true,
    };
    return item;
  });
  return { ...calendar, items, consensus: {
    status: failures ? 'partial' : 'ok', attemptedAt, failedDays: failures,
    matched: items.filter(item => item.forecast !== null).length,
  } };
}

export async function collectCalendarConsensus(calendar, previous, now) {
  let cache = {};
  try {
    const candidate = JSON.parse(await readFile(CACHE, 'utf8'));
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) cache = candidate;
  } catch { /* First consensus collection. */ }
  const result = await enrichCalendarConsensus(calendar, previous, now, fetch, cache);
  const from = shiftDay(calendar.from, -1);
  const to = shiftDay(calendar.to, 2);
  const bounded = Object.fromEntries(Object.entries(cache).filter(([date]) => date >= from && date <= to));
  await writeFile(CACHE, JSON.stringify(bounded));
  return result;
}
