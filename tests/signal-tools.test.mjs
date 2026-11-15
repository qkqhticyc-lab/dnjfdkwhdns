import test from 'node:test';
import assert from 'node:assert/strict';
import { rankScreenItem, rankInputs, passesRankFilters } from '../screener-rank.mjs';
import { evaluateStudyPath, buildSignalStudy, studySummary, STUDY_COSTS, netStudyReturn } from '../signal-study-core.mjs';
import { signalEventHistory } from '../signal-events.mjs';
import { benchmarkRegimes } from '../scripts/study-market.mjs';
import { buildSignalTools } from '../signal-tools-publish.mjs';
import { emptyNotificationState, syncNotificationWatchlist, addSignalNotifications, addCalendarNotifications,
  mergeNotificationStates, parseNotificationState } from '../notifications-core.mjs';

const stock = () => ({ market: 'KR', symbol: '005930', status: 'ok', price: 101, trend: 'up', volumeRatio: 2,
  rankInputs: { shortAligned: true, mediumAligned: true }, liquidity: { average: 5e10 },
  signal: { status: 'active', age: 0, entry: 100, initialStop: 95, tp1: 110 } });
const bar = (extra = {}) => ({ open: 100, high: 102, low: 98, close: 101, ...extra });
const levels = { stop: 95, tp1: 110, tp2: 120 };

test('priority is transparent and currency-normalized with missing data contributing zero', () => {
  const item = stock();
  assert.equal(rankScreenItem(item).score, 100);
  assert.equal(rankScreenItem({ ...item, market: 'US', liquidity: { average: 1e8 } }).score, 100);
  assert.equal(rankScreenItem({ ...item, market: 'JP', liquidity: { average: 5e9 } }).score, 100);
  assert.equal(rankScreenItem({ ...item, liquidity: null }).components[3].points, 0);
  assert.equal(rankScreenItem({ ...item, signal: { ...item.signal, status: 'closed' } }), null);
  assert.equal(rankScreenItem({ ...item, status: 'stale' }), null);
  assert.equal(rankScreenItem({ ...item, price: 94 }).components[0].points, 0);
  assert.equal(rankScreenItem({ ...item, price: 111 }).blocked, 'TP1 이상 이격');
  assert.equal(rankScreenItem({ ...item, rankInputs: undefined }).components[2].points, 10);
  assert.equal(rankInputs({ close: 10 }).shortAligned, null);
  assert.equal(passesRankFilters(item, { minScore: 80, maxGap: 3 }), true);
  assert.equal(passesRankFilters({ ...item, price: 106 }, { maxGap: 3 }), false);
  assert.equal(passesRankFilters(item, { turnoverLimits: { KR: 1e11 } }), false);
});

test('study return uses next open, gap exits and conservative ambiguous OHLC ordering', () => {
  const rows = Array.from({ length: 20 }, () => bar());
  rows[1] = bar({ high: 112, low: 94, close: 108 });
  const result = evaluateStudyPath(rows, levels, 20);
  assert.equal(result.ratio, .95);
  assert.equal(result.tp1, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.mae, -5.000000000000004);
  const gap = evaluateStudyPath([bar(), bar({ open: 90, high: 100, low: 89, close: 94 }), ...rows.slice(2)], levels, 20);
  assert.equal(gap.ratio, .9);
  const target = evaluateStudyPath([bar(), bar({ open: 125, high: 130, low: 97, close: 120 }), ...rows.slice(2)], levels, 20);
  assert.equal(target.ratio, 1.25);
  assert.equal(target.tp2, true);
  assert.equal(target.mae, -2.0000000000000018);
  assert.equal(evaluateStudyPath(rows.slice(0, 3), levels, 5), null);
});

test('signal studies separate incomplete horizons, costs and entry gaps', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ ...bar(), asOf: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10) }));
  const frames = rows.map(row => ({ ...row, trend: 'up', ema8: 99, ema14: 98, ema21: 97, ema55: 96, trade: { initialStop: 95, tp1: 110, tp2: 120 } }));
  const guide = { frames, events: [{ key: 'breakoutEntry', asOf: rows[2].asOf, close: 101 }, { key: 'breakoutEntry', asOf: rows[22].asOf, close: 101 }] };
  const groups = buildSignalStudy(rows, guide, () => 'mixed');
  const summary = studySummary(groups);
  assert.equal(summary.signals, 2);
  assert.equal(summary.results[0].count, 1);
  assert.equal(summary.results[2].pending, 1);
  assert.equal(summary.path.count, 1);
  assert.equal(groups[0].regime, 'mixed');
  assert.ok(netStudyReturn(1, STUDY_COSTS[1]) < 0);
  assert.equal(netStudyReturn(1, STUDY_COSTS[0]), 0);
  const gapRows = rows.map((row, index) => index === 3 ? { ...row, open: 120, high: 121, close: 120 } : row);
  assert.equal(studySummary(buildSignalStudy(gapRows, guide)).gapSkipped, 1);
  const extended = [...rows, ...Array.from({ length: 10 }, (_, index) => ({ ...bar({ close: 500, high: 501 }), asOf: `2026-02-${String(index + 1).padStart(2, '0')}` }))];
  assert.equal(buildSignalStudy(extended, { ...guide, events: guide.events.slice(0, 1) })[0].horizons[20].ratioSum, groups[0].horizons[20].ratioSum);
});

test('notifications bind target and exit events to each independent entry cycle', () => {
  const dates = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
  const frames = dates.map(asOf => ({ asOf }));
  const guide = { frames, asOf: dates[3], events: [
    { key: 'breakoutEntry', asOf: dates[0], close: 100 },
    { key: 'tp1', asOf: dates[1], level: 110 },
    { key: 'triangleEntry', patternType: 'triangle', asOf: dates[1], close: 105 },
    { key: 'tp1', patternType: 'triangle', entryAt: dates[1], asOf: dates[2], level: 115 },
    { key: 'exit', asOf: dates[3], close: 95 },
    { key: 'tp2', asOf: dates[3], provisional: true, level: 120 },
  ] };
  const events = signalEventHistory({ market: 'US', symbol: 'TEST' }, guide);
  assert.equal(events.length, 5);
  assert.equal(events[1].entryAt, dates[0]);
  assert.equal(events[3].entryAt, dates[1]);
  assert.equal(events[0].occurredAt, '2026-11-10T21:00:00.000Z');
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
});

test('market regimes only use observations available at each signal date', () => {
  const rows = Array.from({ length: 70 }, (_, index) => ({ asOf: String(index), close: index + 100 }));
  const before = benchmarkRegimes(rows);
  const after = benchmarkRegimes([...rows, { asOf: '70', close: 1 }]);
  assert.equal(before['59'], 'up');
  assert.equal(before['59'], after['59']);
  assert.equal(before['58'], undefined);
});

test('publisher aggregates sectors without publishing per-symbol historical rows and excludes stale stocks', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ ...bar(), asOf: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10) }));
  const guide = { frames: rows.map(row => ({ ...row, trend: 'up', trade: { initialStop: 95, tp1: 110, tp2: 120 } })),
    events: [{ key: 'breakoutEntry', asOf: rows[1].asOf, close: 101 }] };
  const studies = buildSignalStudy(rows, guide);
  const item = { ...stock(), signalToolsVersion: 1, studies, alertHistory: [] };
  const output = buildSignalTools({ signalToolsVersion: 1, collectedAt: '2026-11-15T09:00:00Z', items: [item, { ...item, symbol: '000660', status: 'stale' }] },
    { items: [{ key: 'KR:005930', id: 'technology' }] });
  assert.equal(output.manifest.evaluatedCount, 1);
  assert.equal(output.manifest.failedCount, 1);
  assert.equal(output.study.groups[0].sector, 'technology');
  assert.equal(output.manifest.signalCount, 1);
  assert.equal(output.shards.length, 32);
  assert.equal(output.study.groups[0].symbol, undefined);
});

test('notification registration starts now, deduplicates signals, and read receipts never regress across tabs', () => {
  const at = Date.parse('2026-11-15T01:00:00Z');
  const identity = { market: 'KR', symbol: '005930', name: '삼성전자' };
  const initial = syncNotificationWatchlist(emptyNotificationState(), [identity], at);
  const event = { id: 'signal-one', kind: 'entry', type: 'breakout', asOf: '2026-11-15', occurredAt: new Date(at + 1000).toISOString() };
  const source = { ...identity, events: [event, { ...event, id: 'older', occurredAt: new Date(at - 1000).toISOString() }] };
  const state = addSignalNotifications(initial, [source], at + 2000);
  assert.equal(state.items.length, 1);
  assert.match(state.items[0].title, /돌파 진입/);
  assert.equal(addSignalNotifications(state, [source], at + 3000).items.length, 1);
  const read = { ...state, items: state.items.map(item => ({ ...item, readAt: at + 4000 })) };
  const merged = mergeNotificationStates(state, read, at + 5000);
  assert.equal(merged.items[0].readAt, at + 4000);
  assert.equal(mergeNotificationStates(merged, state, at + 6000).items[0].readAt, at + 4000);
  const removed = syncNotificationWatchlist(merged, [], at + 7000);
  assert.equal(removed.watched['KR:005930'], undefined);
  assert.equal(addSignalNotifications(removed, [source], at + 8000).items.length, 1);
  assert.equal(syncNotificationWatchlist(removed, [identity], at + 9000).watched['KR:005930'], at + 9000);
});

test('calendar notifications are opt-in for macro, stock-scoped for earnings, and retain initial notification time', () => {
  const now = Date.parse('2026-11-15T01:00:00Z');
  const stock = { market: 'KR', symbol: '005930', name: '삼성전자' };
  const state = syncNotificationWatchlist(emptyNotificationState(), [stock], now - 86400000);
  const earnings = [{ id: 'report', date: '2026-11-16', title: '분기 실적', stock }];
  const macro = [{ id: 'cpi', title: '소비자물가', major: true, actual: null, date: '2026-11-15', time: '10:30', scheduledAt: new Date(now + 1800000).toISOString(), forecast: '3.0%' }];
  const first = addCalendarNotifications(state, earnings, macro, now);
  assert.equal(first.items.length, 1);
  const second = addCalendarNotifications(first, earnings, macro, now + 60000);
  assert.equal(second.items[0].occurredAt, first.items[0].occurredAt);
  const enabled = addCalendarNotifications({ ...first, settings: { ...state.settings, macro: true } }, earnings, macro, now + 60000);
  assert.equal(enabled.items.length, 2);
  assert.equal(enabled.items[0].kind, 'macro');
  assert.equal(addCalendarNotifications(state, [{ ...earnings[0], stock: { market: 'US', symbol: 'MU', name: 'Micron' } }], [], now).items.length, 0);
  assert.deepEqual(parseNotificationState('{invalid').items, []);
  assert.equal(parseNotificationState(JSON.stringify(enabled)).items.length, 2);
});
