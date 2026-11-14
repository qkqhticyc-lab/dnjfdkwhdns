import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCalendarEvent, calendarStatus, normalizeHeadline, mergeHeadlines,
  settleNewsFeed, validateMarketNews, koreaDay, shiftDay, safeNewsUrl,
} from '../market-news-core.mjs';
import { collectEconomicCalendar, collectDomesticNews, collectGlobalNews } from '../market-news-source.mjs';
import { compareIndicatorForecast, matchCalendarConsensus, parseIndicatorNumber } from '../calendar-consensus-core.mjs';
import { enrichCalendarConsensus, consensusQueryDay } from '../scripts/calendar-consensus.mjs';

const now = Date.parse('2026-11-14T10:00:00Z');
const date = '2026-11-14';
function rawEvent(extra = {}) {
  return {
    eventKey: 'cpi-202611', category: 'economicIndicators', title: '소비자물가지수(CPI)',
    nationType: 'USA', subtitle: '22:30 예정 · 시장 영향력 보통',
    productKey: { itemCode: 'USCPI=ECIX' },
    information: [{ label: '이전', value: '0.30%' }, { label: '발표', value: '-', badge: '예정' }],
    ...extra,
  };
}
function headline(extra = {}) {
  return { officeId: '001', articleId: '123', title: '미국 증시, 금리 인하 기대에 상승',
    datetime: '2026-11-14 18:00:00', officeHname: '연합뉴스', ...extra };
}
const response = body => ({ ok: true, json: async () => body });

test('calendar source KST is converted with date rollover and source units retained', () => {
  const event = normalizeCalendarEvent(rawEvent({ subtitle: '00:30 발표 · 시장 영향력 높음',
    information: [{ label: '발표', value: '200.00K' }, { label: '이전 대비', change: { value: '+9.00K' } }] }), date);
  assert.equal(event.scheduledAt, '2026-11-13T15:30:00.000Z');
  assert.equal(event.actual, '200.00K');
  assert.equal(event.change, '+9.00K');
  assert.equal(event.previous, null);
  assert.equal(calendarStatus(event, now), 'released');
  assert.equal(koreaDay('2026-11-13T15:01:00Z'), date);
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

test('zero is a released value and time passage never fabricates a release', () => {
  const zero = normalizeCalendarEvent(rawEvent({ information: [{ label: '발표', value: 0 }] }), date);
  assert.equal(zero.actual, '0');
  assert.equal(calendarStatus(zero, now), 'released');
  const event = normalizeCalendarEvent(rawEvent(), date);
  assert.equal(calendarStatus(event, now), 'upcoming');
  assert.equal(calendarStatus(event, now + 86400000), 'pending');
  assert.equal(normalizeCalendarEvent(rawEvent({ information: [{ label: '발표', value: '0', badge: '예정' }] }), date).actual, null);
});

test('unknown release time remains unknown and major CPI survives source low-impact flag', () => {
  const event = normalizeCalendarEvent(rawEvent({ subtitle: '시장 영향력 낮음' }), date);
  assert.equal(event.time, null);
  assert.equal(event.scheduledAt, null);
  assert.equal(event.major, true);
  assert.equal(calendarStatus(event, now + 86400000), 'pending');
  assert.equal(normalizeCalendarEvent(rawEvent(), '2026-02-30'), null);
});

test('major headlines have safe original links, known timestamps, and no article body', () => {
  const item = normalizeHeadline(headline({ subcontent: 'Article body should never be stored.' }), 'domestic', now);
  assert.equal(item.publishedAt, '2026-11-14T09:00:00.000Z');
  assert.equal(item.url, 'https://n.news.naver.com/mnews/article/001/123');
  assert.equal(item.topic, '금리·물가');
  assert.equal(item.subcontent, undefined);
  assert.equal(normalizeHeadline(headline({ title: '찰스 국왕의 생일 축하 공연' }), 'global', now), null);
  assert.equal(normalizeHeadline(headline({ datetime: '2026-11-14T18:00:00' }), 'global', now), null);
  assert.equal(normalizeHeadline(headline({ datetime: '2026-11-15T18:00:00Z' }), 'global', now), null);
  assert.equal(safeNewsUrl('javascript:alert(1)'), null);
  assert.equal(safeNewsUrl('https://stock.naver.com.evil.test/'), null);
  assert.equal(safeNewsUrl('https://user@stock.naver.com/'), null);
});

test('news deduplicates titles and retains original freshness during failures', () => {
  const first = normalizeHeadline(headline(), 'domestic', now);
  const second = normalizeHeadline(headline({ articleId: '124', title: '미국 증시 금리 인하 기대에 상승' }), 'domestic', now);
  assert.equal(mergeHeadlines([first, first, second], now).length, 1);
  const old = { status: 'ok', fetchedAt: '2026-11-13T09:00:00Z', items: [first] };
  const failed = settleNewsFeed(old, { status: 'rejected' }, new Date(now).toISOString());
  assert.equal(failed.status, 'stale');
  assert.equal(failed.fetchedAt, old.fetchedAt);
  const empty = settleNewsFeed(null, { status: 'rejected' }, new Date(now).toISOString());
  assert.equal(empty.status, 'unavailable');
  const snapshot = { schemaVersion: 1, attemptedAt: new Date(now).toISOString(), domestic: failed, global: empty, calendar: empty };
  assert.equal(validateMarketNews(snapshot), true);
  assert.equal(validateMarketNews({ ...snapshot, calendar: { ...empty, items: [{}] } }), false);
});

test('calendar collector completes truncated days and uses unpersonalized economic requests', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (url.endsWith('/more')) return response({ events: [rawEvent({ eventKey: 'cpi-2' })], hasNext: false });
    return response({ hasNext: true, dateGroups: [{ date, totalCount: '2', hasNext: true, events: [rawEvent()] }] });
  };
  const result = await collectEconomicCalendar(now, fetcher);
  assert.equal(result.items.length, 2);
  assert.equal(result.from, '2026-10-31');
  assert.equal(result.to, '2026-12-14');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body.codes, []);
  assert.equal(calls[0].body.myStocksOnly, false);
  assert.equal(calls[0].body.category, 'economicIndicators');
  await assert.rejects(collectEconomicCalendar(now, async () => response({ dateGroups: [{ date, totalCount: '2', hasNext: false, events: [rawEvent()] }] })), /Truncated/);
});

test('headline collectors use major-news category, follow foreign cursor, and reject empty sources', async () => {
  let requested;
  const domestic = await collectDomesticNews(now, async url => { requested = new URL(url); return response({ articles: [headline()] }); });
  assert.equal(requested.searchParams.get('category'), 'MAINNEWS');
  assert.equal(requested.searchParams.get('date'), '20261114');
  assert.equal(domestic.items.length, 1);
  const urls = [];
  const global = await collectGlobalNews(now, async url => {
    urls.push(url);
    return response({ items: [headline({ articleId: String(urls.length) })], hasNext: urls.length === 1, cursor: 'next' });
  });
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]).searchParams.get('cursor'), 'next');
  assert.equal(global.items.length, 1);
  assert.match(global.items[0].url, /\/news\/worldnews\//);
  await assert.rejects(collectDomesticNews(now, async () => response({ articles: [] })), /Empty/);
});

test('forecast comparison handles signs, zero, scaled units and missing values', () => {
  assert.equal(compareIndicatorForecast('0.40%', '0.3%'), 'above');
  assert.equal(compareIndicatorForecast('0.30%', '0.3%'), 'equal');
  assert.equal(compareIndicatorForecast('0.20%', '0.3%'), 'below');
  assert.equal(compareIndicatorForecast('-105.00B', '-107.9B'), 'above');
  assert.equal(compareIndicatorForecast('-1.5%', '-0.5%'), 'below');
  assert.equal(compareIndicatorForecast(0, '0.0'), 'equal');
  assert.equal(compareIndicatorForecast('−0.0%', '0%'), 'equal');
  assert.equal(compareIndicatorForecast('1,000K', '1.0M'), 'equal');
  for (const value of [null, '', '-', '미제공', '1~2', 'NaN', '1.2% revised']) assert.equal(parseIndicatorNumber(value), null);
  assert.equal(compareIndicatorForecast('3%', '3'), null);
  assert.equal(compareIndicatorForecast('3', null), null);
});

test('consensus matches an exact release clock, country, name, units and actual', () => {
  const event = normalizeCalendarEvent(rawEvent({ information: [{ label: '발표', value: '0.40%' }] }), '2026-11-10');
  const row = { country: 'United States', gmt: '08:30', eventName: 'CPI', actual: '0.4%', consensus: '0.3%', previous: '0.6%' };
  assert.deepEqual(matchCalendarConsensus(event, [row]), { forecast: '0.3%', previous: '0.6%' });
  assert.equal(matchCalendarConsensus(event, [{ ...row, country: 'South Korea' }]), null);
  assert.equal(matchCalendarConsensus(event, [{ ...row, gmt: '09:30' }]), null);
  assert.equal(matchCalendarConsensus(event, [{ ...row, eventName: 'Core CPI' }]), null);
  assert.equal(matchCalendarConsensus(event, [{ ...row, actual: '0.5%' }]), null);
  assert.equal(matchCalendarConsensus(event, [{ ...row, actual: '0.4' }]), null);
  assert.equal(matchCalendarConsensus(event, [row, { ...row }]), null);
});

test('upcoming YoY and MoM releases require a unique same prior before forecasting', () => {
  const event = normalizeCalendarEvent(rawEvent({ information: [{ label: '이전', value: '0.60%' }] }), '2026-11-10');
  const monthly = { country: 'United States', gmt: '08:30', eventName: 'CPI', actual: '&nbsp;', consensus: '0.3%', previous: '0.6%' };
  const yearly = { ...monthly, consensus: '3.7%', previous: '3.8%' };
  assert.equal(matchCalendarConsensus(event, [monthly, yearly]).forecast, '0.3%');
  assert.equal(matchCalendarConsensus({ ...event, previous: null }, [monthly]), null);
  assert.equal(matchCalendarConsensus(event, [{ ...monthly, consensus: ' ' }]), null);
  const housing = { ...event, code: 'USHST=ECIX', previous: '1.22M' };
  const row = { ...monthly, eventName: 'Housing Starts', previous: '1.221M', consensus: '1.230M' };
  assert.equal(matchCalendarConsensus(housing, [row]).forecast, '1.230M');
  assert.equal(matchCalendarConsensus(housing, [{ ...row, previous: '1.225M' }]), null);
});

test('consensus source sessions handle New York DST and KST date rollover', () => {
  const winter = normalizeCalendarEvent(rawEvent(), '2026-11-10');
  assert.equal(consensusQueryDay(winter), '2026-11-11');
  const summer = { ...winter, scheduledAt: '2026-07-10T12:30:00.000Z' };
  const row = { country: 'United States', gmt: '08:30', eventName: 'CPI', actual: '0.4%', consensus: '0.3%', previous: '0.6%' };
  assert.equal(matchCalendarConsensus({ ...summer, actual: '0.4%' }, [row]).forecast, '0.3%');
  const midnightKst = { ...winter, scheduledAt: '2026-11-12T15:00:00.000Z' };
  assert.equal(consensusQueryDay(midnightKst), '2026-11-13');
});

test('supplemental source failure preserves only the same release forecast and timestamp', async () => {
  const event = normalizeCalendarEvent(rawEvent({ information: [{ label: '발표', value: '0.40%' }] }), '2026-11-10');
  const calendar = { from: '2026-10-31', to: '2026-12-14', items: [event] };
  const old = { ...event, forecast: '0.3%', forecastSource: 'Nasdaq', forecastFetchedAt: '2026-11-10T14:00:00Z' };
  const result = await enrichCalendarConsensus(calendar, { items: [old] }, now, async () => { throw Error('Source down'); });
  assert.equal(result.items[0].forecast, '0.3%');
  assert.equal(result.items[0].forecastFetchedAt, old.forecastFetchedAt);
  assert.equal(result.items[0].forecastStale, true);
  assert.equal(result.consensus.status, 'partial');
  const moved = { ...old, scheduledAt: '2026-11-11T13:30:00Z' };
  const missing = await enrichCalendarConsensus(calendar, { items: [moved] }, now, async () => { throw Error('Source down'); });
  assert.equal(missing.items[0].forecast, null);
});

test('consensus collection retains provenance and copies only market data', async () => {
  const event = normalizeCalendarEvent(rawEvent({ information: [{ label: '발표', value: '0.40%' }] }), '2026-11-10');
  let requested;
  const result = await enrichCalendarConsensus({ items: [event] }, null, now, async url => {
    requested = url;
    return response({ status: { rCode: 200 }, data: { rows: [{ country: 'United States', gmt: '08:30', eventName: 'CPI',
      actual: '0.4%', consensus: '0.3%', previous: '0.6%', description: 'Full article must be omitted' }] } });
  });
  assert.match(requested, /date=2026-11-11$/);
  assert.equal(result.items[0].forecast, '0.3%');
  assert.equal(result.items[0].forecastSource, 'Nasdaq');
  assert.equal(result.items[0].forecastStale, false);
  assert.equal(result.items[0].description, undefined);
  assert.equal(result.consensus.matched, 1);
});
