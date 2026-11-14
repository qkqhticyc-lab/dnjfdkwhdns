import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { collectDomesticNews, collectGlobalNews, collectEconomicCalendar } from '../market-news-source.mjs';
import { settleNewsFeed, validateMarketNews } from '../market-news-core.mjs';

const CACHE = '.cache/news';
const SITE = 'https://qkqhticyc-lab.github.io/dnjfdkwhdns/';
const now = Date.now();
const attemptedAt = new Date(now).toISOString();
await mkdir(CACHE, { recursive: true });
let previous = null;
try {
  const cached = JSON.parse(await readFile(`${CACHE}/publish.json`, 'utf8'));
  if (validateMarketNews(cached)) previous = cached;
} catch { /* First collection has no local cache. */ }
try {
  const response = await fetch(SITE + 'data/news.json', { signal: AbortSignal.timeout(10000) });
  if (response.ok) {
    const live = await response.json();
    if (validateMarketNews(live) && (!previous || live.attemptedAt > previous.attemptedAt)) previous = live;
  }
} catch { /* Keep the local snapshot when Pages is temporarily unreachable. */ }

const results = await Promise.allSettled([
  collectDomesticNews(now), collectGlobalNews(now), collectEconomicCalendar(now),
]);
const output = { schemaVersion: 1, attemptedAt, refreshMinutes: 30 };
for (const [index, name] of ['domestic', 'global', 'calendar'].entries()) {
  output[name] = settleNewsFeed(previous?.[name], results[index], attemptedAt);
  console.log(`${name}: ${output[name].status}, ${output[name].items.length} items`);
  if (results[index].status === 'rejected') console.log(results[index].reason.message);
}
if (!validateMarketNews(output)) throw Error('Invalid market news snapshot');
if (!Object.values(output).some(feed => feed?.items?.length)) throw Error('No usable news or calendar data');
await writeFile(`${CACHE}/publish.json.tmp`, JSON.stringify(output));
await rename(`${CACHE}/publish.json.tmp`, `${CACHE}/publish.json`);
