import { emptyStudyGroup, mergeStudyGroup, STUDY_VERSION } from './signal-study-core.mjs';
import { eventShard } from './signal-events.mjs';
import { excludedStock } from './screener-core.mjs';

export const ALERT_SHARDS = 32;

export function buildSignalTools(scan, sectors) {
  if (scan?.signalToolsVersion !== 1 || !Array.isArray(scan.items) || !Number.isFinite(Date.parse(scan.collectedAt))) throw Error('Signal study scan is unavailable');
  const classified = new Map((sectors?.items || []).map(item => [item.key, item.id]));
  const groups = new Map();
  const shards = Array.from({ length: ALERT_SHARDS }, () => ({ schemaVersion: 1, collectedAt: scan.collectedAt, stocks: {} }));
  let evaluated = 0, excluded = 0;
  for (const item of scan.items) {
    if (item.status !== 'ok' || item.signalToolsVersion !== 1 || !Array.isArray(item.studies) || !Array.isArray(item.alertHistory)) continue;
    evaluated++;
    const key = item.market + ':' + item.symbol;
    const sector = classified.get(key) || 'unknown';
    if (excludedStock(item)) excluded++;
    for (const study of excludedStock(item) ? [] : item.studies) {
      const id = [item.market, sector, study.month, study.type, study.trend, study.regime].join('|');
      if (!groups.has(id)) groups.set(id, { market: item.market, sector, ...emptyStudyGroup(study.month, study.type, study.trend, study.regime) });
      mergeStudyGroup(groups.get(id), study);
    }
    shards[eventShard(key)].stocks[key] = {
      market: item.market, symbol: item.symbol, name: item.name, currency: item.currency, exchange: item.exchange,
      asOf: item.asOf, events: item.alertHistory,
    };
  }
  if (!evaluated) throw Error('No completed signal study rows');
  const rows = [...groups.values()].sort((a, b) => a.month.localeCompare(b.month) || a.market.localeCompare(b.market) || a.type.localeCompare(b.type));
  const round = (_key, value) => typeof value === 'number' && !Number.isInteger(value) ? Number(value.toFixed(8)) : value;
  const rounded = JSON.parse(JSON.stringify(rows, round));
  const manifest = {
    schemaVersion: 1, studyVersion: STUDY_VERSION, status: 'ok', collectedAt: scan.collectedAt,
    universeCount: scan.items.length, evaluatedCount: evaluated, failedCount: scan.items.length - evaluated,
    excludedCount: excluded,
    signalCount: rows.reduce((sum, group) => sum + group.signals, 0),
    fromMonth: rows[0]?.month || null, toMonth: rows.at(-1)?.month || null,
    notificationShards: ALERT_SHARDS,
    benchmarks: Object.fromEntries(Object.entries(scan.marketRegimes || {}).map(([market, value]) => [market, { symbol: value.symbol, status: value.status }])),
    sectorAsOf: sectors?.collectedAt || null,
  };
  return { manifest, study: { ...manifest, groups: rounded }, shards };
}

export function validSignalManifest(data) {
  return data?.schemaVersion === 1 && [1,2].includes(data.studyVersion) && ['ok', 'unavailable'].includes(data.status)
    && (data.status === 'unavailable' || Number.isFinite(Date.parse(data.collectedAt)))
    && data.notificationShards === ALERT_SHARDS;
}
