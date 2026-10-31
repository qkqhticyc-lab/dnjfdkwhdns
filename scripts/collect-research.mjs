import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { normalizeDomestic, normalizeOverseas, earningsReview, settleFeed } from './research-core.mjs';

const CACHE = '.cache/research';
const SITE = 'https://qkqhticyc-lab.github.io/dnjfdkwhdns/';
const now = new Date().toISOString();
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const since = new Date(Date.parse(`${day}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; } }
await mkdir(CACHE, { recursive: true });
await mkdir('data', { recursive: true });
let previous = await readJson(`${CACHE}/research.json`, null) || await readJson('data/research.json', {});
// The last deployed snapshot survives runner cache eviction, with no database secret.
try {
  const r = await fetch(`${SITE}data/research.json`, { signal: AbortSignal.timeout(10000) });
  if (r.ok) { const live = await r.json(); if (live.schemaVersion === 1 && (!previous.attemptedAt || live.attemptedAt > previous.attemptedAt)) previous = live; }
} catch { /* Initial publication or a temporary Pages outage. */ }
const detailCache = new Map((previous.targets?.items || []).map(item => [item.id, item]));
const reviewCache = new Map((previous.earnings?.items || []).map(item => [item.id, item]));
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'User-Agent': `InvestmentNote/1.0 (${SITE})`, ...options.headers }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function domestic() {
  const listed = [], seen = new Set();
  for (let index = 0; index < 4; index++) {
    const data = await json(`https://stock.naver.com/api/stockSecurity/researches/v2/company?index=${index}&size=50`);
    if (!Array.isArray(data.items) || (index === 0 && !data.items.length)) throw Error('Domestic source schema changed or returned no reports');
    for (const row of data.items) if (row.writeDate >= since && !seen.has(row.nid)) { seen.add(row.nid); listed.push(row); }
    if (!data.hasNext || data.items.at(-1)?.writeDate < since) break;
    await delay(250);
  }
  const targets = [], earnings = [];
  let detailFailures = 0;
  // Small batches bound load on the source. Preserve raw report text only in memory.
  for (let i = 0; i < listed.length; i += 3) {
    await Promise.all(listed.slice(i, i + 3).map(async row => {
      const id = `naver-${row.nid}`, cached = detailCache.get(id);
      if (previous.parserVersion === 2 && cached?.detailsVerified && cached.title === row.title && cached.targetPrice === Number(row.goalPrice)) {
        targets.push(cached); if (reviewCache.has(id)) earnings.push(reviewCache.get(id)); return;
      }
      try {
        if (!/^\d+$/.test(row.nid)) throw Error('Invalid report ID');
        const full = await json(`https://stock.naver.com/api/stockSecurity/researches/v2/company/${row.nid}`);
        if (String(full.nid) !== String(row.nid) || full.itemCode !== row.itemCode || String(full.brokerCode) !== String(row.brokerCode)) throw Error('Report identity mismatch');
        const item = normalizeDomestic(full); if (!item) throw Error('Invalid domestic report');
        item.detailsVerified = true;
        targets.push(item); const review = earningsReview(full, item); if (review) earnings.push(review);
      } catch {
        detailFailures++;
        if (cached) { targets.push(cached); if (reviewCache.has(id)) earnings.push(reviewCache.get(id)); }
        else { const item = normalizeDomestic(row); if (item) targets.push(item); const review = item && earningsReview(row, item); if (review) earnings.push(review); }
      }
    }));
    await delay(200);
  }
  if (!targets.length) throw Error('No domestic reports collected');
  const sort = (a, b) => b.date.localeCompare(a.date) || Number(b.id.split('-').at(-1)) - Number(a.id.split('-').at(-1));
  return { targets: targets.sort(sort), earnings: earnings.sort(sort), detailFailures };
}
async function overseas() {
  const rows = [], seen = new Set();
  for (let page = 1; page <= 4; page++) {
    const data = await json('https://globalmonitor.einfomax.co.kr/bizrpt/reportlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', Referer: 'https://globalmonitor.einfomax.co.kr/ht_usa.html' },
      body: JSON.stringify({ cmd: 'rl_011', page, pagePerItem: 50, sortType: 'latest', lscCd: 700,
        sscCd: '524910,521090,523050,523070', authLscCd: 0, authSscCd: 0, targetPeriodCheck: false,
        targetPeriodDate: null, startDate: since, endDate: day, searchItem: 'title', searchStr: '' }),
    });
    if (!data.res || !Array.isArray(data.reportlist)) throw Error('Overseas source schema changed');
    for (const raw of data.reportlist) { const row = normalizeOverseas(raw); if (row && row.date >= since && row.date <= day && !seen.has(row.id)) { seen.add(row.id); rows.push(row); } }
    if (data.reportlist.length < 50) break;
    await delay(250);
  }
  if (!rows.length) throw Error('No overseas reports collected');
  return rows.sort((a, b) => b.date.localeCompare(a.date) || Number(b.id.split('-').at(-1)) - Number(a.id.split('-').at(-1)));
}
const results = await Promise.allSettled([domestic(), overseas()]);
const kr = results[0], us = results[1];
const output = {
  schemaVersion: 1, parserVersion: 2, attemptedAt: now, refreshMinutes: 30,
  targets: settleFeed(previous.targets, kr.value?.targets || [], kr.reason, now),
  earnings: settleFeed(previous.earnings, kr.value?.earnings || [], kr.reason, now),
  overseas: settleFeed(previous.overseas, us.value || [], us.reason, now),
};
if (kr.value?.detailFailures) {
  output.targets.status = 'partial';
  output.targets.message = `일부 보고서의 이전 목표주가를 확인하지 못했습니다. 확인되지 않은 값은 비교하지 않습니다.`;
  output.earnings.status = 'partial';
  output.earnings.message = '일부 보고서 상세 조회가 지연되고 있습니다. 확인된 자료만 표시합니다.';
}
for (const [name, result] of [['domestic', kr], ['overseas', us]]) {
  console.log(result.status === 'fulfilled' ? `${name}: collected` : `${name}: preserved previous data (${result.reason?.message})`);
}
if (![output.targets, output.earnings, output.overseas].some(feed => feed.items.length)) throw Error('No usable research feeds; refusing to publish empty data');
const serialized = JSON.stringify(output, null, 2) + '\n';
await writeFile('data/research.json.tmp', serialized);
await rename('data/research.json.tmp', 'data/research.json');
await writeFile(`${CACHE}/research.json`, serialized);
console.log(JSON.stringify({ targets: output.targets.items.length, earnings: output.earnings.items.length, overseas: output.overseas.items.length, statuses: [output.targets.status, output.earnings.status, output.overseas.status] }));
