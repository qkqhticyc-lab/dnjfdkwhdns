import test from 'node:test';
import assert from 'node:assert/strict';
import { rankScreenItem, rankInputs, passesRankFilters } from '../screener-rank.mjs';
import { evaluateStudyPath, buildSignalStudy, studySummary, emptyStudyGroup, STUDY_COSTS, netStudyReturn } from '../signal-study-core.mjs';
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

function achievementFixture() {
  const rows=Array.from({length:24},(_,index)=>({...bar(),asOf:new Date(Date.UTC(2026,0,index+1)).toISOString().slice(0,10)}));
  const guide={frames:rows.map(row=>({...row,trend:'up',trade:{initialStop:95,tp1:110,tp2:120}})),events:[{key:'breakoutEntry',asOf:rows[0].asOf}]};
  return {rows,guide};
}

test('achievement ratios use each completed horizon and include TP1 before a later TP2 or stop',()=>{
  const {rows,guide}=achievementFixture();
  rows[3]= {...rows[3],high:112,close:109};
  rows[7]= {...rows[7],high:122,close:119};
  let summary=studySummary(buildSignalStudy(rows,guide));
  assert.deepEqual(summary.results.map(row=>[row.pathCount,row.tp1Rate,row.tp2Rate,row.stopRate]),[[1,100,0,0],[1,100,100,0],[1,100,100,0]]);
  rows[7]={...rows[7],high:109,low:94,close:97};
  summary=studySummary(buildSignalStudy(rows,guide));
  assert.deepEqual(summary.results.map(row=>[row.tp1Count,row.tp2Count,row.stopCount]),[[1,0,0],[1,0,1],[1,0,1]]);
  assert.equal(summary.results[2].tp1Rate,100);assert.equal(summary.results[2].stopRate,100);
});

test('same-bar target and stop ambiguity remains conservative and incomplete horizons never enter the denominator',()=>{
  const {rows,guide}=achievementFixture();
  rows[2]={...rows[2],high:125,low:94};
  const summary=studySummary(buildSignalStudy(rows.slice(0,8),guide));
  assert.equal(summary.results[0].tp1Rate,0);assert.equal(summary.results[0].tp2Rate,0);assert.equal(summary.results[0].stopRate,100);assert.equal(summary.results[0].ambiguous,1);
  assert.equal(summary.results[1].pathCount,0);assert.equal(summary.results[1].tp1Rate,null);assert.equal(summary.results[1].pending,1);
  const empty=studySummary([]);assert.equal(empty.results[0].stopRate,null);
});

test('achievement aggregation weights counts and reads legacy 20-bar paths without inventing shorter-horizon results',()=>{
  const a=emptyStudyGroup('2026-01','breakout','up'),b=emptyStudyGroup('2026-02','breakout','up');
  a.signals=2;b.signals=8;
  for(const group of [a,b]){
    const count=group.signals;
    Object.assign(group.horizons[20],{count,pathCount:count,tp1:group===a?0:8,tp2:group===a?0:4,stop:group===a?2:4,ambiguous:1});
  }
  const summary=studySummary([a,b]).results[2];
  assert.equal(summary.pathCount,10);assert.equal(summary.tp1Rate,80);assert.equal(summary.tp2Rate,40);assert.equal(summary.stopRate,60);assert.equal(summary.ambiguous,2);
  const {rows,guide}=achievementFixture();rows[3]={...rows[3],high:112};
  const legacy=buildSignalStudy(rows,guide)[0];
  for(const horizon of [5,10,20])for(const key of ['pathCount','tp1','tp2','stop','ambiguous'])delete legacy.horizons[horizon][key];
  const old=studySummary([legacy]);assert.equal(old.results[0].count,1);assert.equal(old.results[0].pathCount,0);assert.equal(old.results[0].tp1Rate,null);
  assert.equal(old.results[2].pathCount,1);assert.equal(old.results[2].tp1Rate,100);assert.equal(old.results[2].stopRate,0);
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
  const special = buildSignalTools({ signalToolsVersion: 1, collectedAt: '2026-11-15T09:00:00Z',
    items: [item, { ...item, symbol: '123456', name: '테스트스팩' }] }, null);
  assert.equal(special.manifest.excludedCount, 1);
  assert.equal(special.manifest.signalCount, 1);
  assert.ok(special.shards.some(shard => shard.stocks['KR:123456']));
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
