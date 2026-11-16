import { ENTRY_KEYS, entryTrigger } from './entry-types.mjs';

export const STUDY_VERSION = 2;
export const STUDY_HORIZONS = [5, 10, 20];
export const STUDY_COSTS = [
  { id: 'none', label: '비용 없음', fee: 0, slippage: 0 },
  { id: 'standard', label: '편도 비용 0.1% + 슬리피지 0.1%', fee: .001, slippage: .001 },
  { id: 'high', label: '편도 비용 0.2% + 슬리피지 0.2%', fee: .002, slippage: .002 },
];

export function netStudyReturn(ratio, cost) {
  return (ratio * (1 - cost.slippage) * (1 - cost.fee) / ((1 + cost.slippage) * (1 + cost.fee)) - 1) * 100;
}

export function emptyStudyGroup(month, type, trend, regime = 'unknown') {
  return {
    month, type, trend, regime, signals: 0, gapSkipped: 0, missingNext: 0,
    horizons: Object.fromEntries(STUDY_HORIZONS.map(horizon => [horizon, {
      count: 0, ratioSum: 0, maeSum: 0, worstMae: 0, wins: STUDY_COSTS.map(() => 0),
      pathCount: 0, tp1: 0, tp2: 0, stop: 0, ambiguous: 0,
    }])),
    path: { count: 0, tp1: 0, tp2: 0, stop: 0, ambiguous: 0 },
  };
}

export function mergeStudyGroup(target, source) {
  target.signals += source.signals;
  target.gapSkipped += source.gapSkipped;
  target.missingNext += source.missingNext;
  for (const horizon of STUDY_HORIZONS) {
    const to = target.horizons[horizon], from = source.horizons[horizon];
    to.count += from.count;
    to.ratioSum += from.ratioSum;
    to.maeSum += from.maeSum;
    to.worstMae = Math.min(to.worstMae, from.worstMae);
    for (let index = 0; index < STUDY_COSTS.length; index++) to.wins[index] += from.wins[index];
    // Older snapshots recorded target/stop counts only for the 20-bar horizon.
    const path=Number.isFinite(from.pathCount)?from:horizon===20?{...source.path,pathCount:source.path.count}:null;
    if(path) {
      to.pathCount+=path.pathCount;
      for(const key of ['tp1','tp2','stop','ambiguous'])to[key]+=path[key];
    }
  }
  for (const key of Object.keys(target.path)) target.path[key] += source.path[key];
  return target;
}

// Study fixed initial levels separately from the chart's trailing management.
// Open gaps establish order. Inside one OHLC bar, simultaneous stop/target
// contact is ambiguous and the return model fills the stop first.
export function evaluateStudyPath(rows, levels, horizon, maxHolding = 20) {
  const entry = rows[0]?.open;
  if (!Number.isFinite(entry) || entry <= 0 || rows.length < horizon) return null;
  const limit = Math.min(horizon, maxHolding);
  let tp1 = false, tp2 = false, stopped = false, ambiguous = false, exit;
  let minimum = entry;
  for (const row of rows.slice(0, limit)) {
    if (![row.open, row.high, row.low, row.close].every(value => Number.isFinite(value) && value > 0)) return null;
    if (row.open <= levels.stop) { minimum = Math.min(minimum, row.open); stopped = true; exit = row.open; break; }
    if (row.open >= levels.tp2) { tp1 = true; tp2 = true; exit = row.open; break; }
    if (row.open >= levels.tp1) tp1 = true;
    const stopTouch = row.low <= levels.stop;
    const firstTarget = row.high >= levels.tp1;
    const lastTarget = row.high >= levels.tp2;
    if (stopTouch) {
      ambiguous = (!tp1 && firstTarget) || lastTarget;
      stopped = true;
      minimum = Math.min(minimum, levels.stop);
      exit = levels.stop;
      break;
    }
    minimum = Math.min(minimum, row.low);
    tp1 ||= firstTarget;
    if (lastTarget) { tp2 = true; exit = levels.tp2; break; }
  }
  exit ??= rows[limit - 1].close;
  return { ratio: exit / entry, mae: (minimum / entry - 1) * 100, tp1, tp2, stopped, ambiguous };
}

export function buildSignalStudy(rows, guide, regimeAt = () => 'unknown') {
  const indexByDate = new Map(rows.map((row, index) => [row.asOf, index]));
  const groups = new Map();
  for (const event of guide.events) {
    if (!ENTRY_KEYS.includes(event.key) || event.provisional) continue;
    const index = indexByDate.get(event.asOf);
    if (index === undefined) continue;
    const type = entryTrigger(guide.frames, index, event.key).type;
    if (type === 'unknown') continue;
    const frame = guide.frames[index];
    const initial = event.levels || frame.trade;
    if (!initial || ![initial.initialStop, initial.tp1, initial.tp2].every(Number.isFinite)) continue;
    const trend = ['up', 'mixed', 'down'].includes(frame.trend) ? frame.trend : 'unknown';
    const month = event.asOf.slice(0, 7), regime = regimeAt(event.asOf);
    const key = [month, type, trend, regime].join('|');
    if (!groups.has(key)) groups.set(key, emptyStudyGroup(month, type, trend, regime));
    const group = groups.get(key);
    group.signals++;
    const future = rows.slice(index + 1, index + 21);
    if (!future.length) { group.missingNext++; continue; }
    if (future[0].open <= initial.initialStop || future[0].open >= initial.tp1) { group.gapSkipped++; continue; }
    const levels = { stop: initial.initialStop, tp1: initial.tp1, tp2: initial.tp2 };
    for (const horizon of STUDY_HORIZONS) {
      const result = evaluateStudyPath(future, levels, horizon, type === 'oversoldBounce' ? 8 : 20);
      if (!result) continue;
      const bucket = group.horizons[horizon];
      bucket.count++;
      bucket.pathCount++;
      bucket.tp1+=Number(result.tp1);
      bucket.tp2+=Number(result.tp2);
      bucket.stop+=Number(result.stopped);
      bucket.ambiguous+=Number(result.ambiguous);
      bucket.ratioSum += result.ratio;
      bucket.maeSum += result.mae;
      bucket.worstMae = Math.min(bucket.worstMae, result.mae);
      for (const [costIndex, cost] of STUDY_COSTS.entries()) if (netStudyReturn(result.ratio, cost) > 0) bucket.wins[costIndex]++;
      if (horizon === 20) {
        group.path.count++;
        group.path.tp1 += Number(result.tp1);
        group.path.tp2 += Number(result.tp2);
        group.path.stop += Number(result.stopped);
        group.path.ambiguous += Number(result.ambiguous);
      }
    }
  }
  return [...groups.values()];
}

export function studySummary(groups, costIndex = 1) {
  const total = emptyStudyGroup('', '', '');
  for (const group of groups) mergeStudyGroup(total, group);
  return {
    ...total,
    results: STUDY_HORIZONS.map(horizon => {
      const bucket = total.horizons[horizon];
      return {
        horizon, count: bucket.count, pending: total.signals - total.gapSkipped - bucket.count,
        pathCount: bucket.pathCount,
        tp1Count: bucket.tp1, tp2Count: bucket.tp2, stopCount: bucket.stop, ambiguous: bucket.ambiguous,
        tp1Rate: bucket.pathCount?bucket.tp1/bucket.pathCount*100:null,
        tp2Rate: bucket.pathCount?bucket.tp2/bucket.pathCount*100:null,
        stopRate: bucket.pathCount?bucket.stop/bucket.pathCount*100:null,
        mean: bucket.count ? netStudyReturn(bucket.ratioSum / bucket.count, STUDY_COSTS[costIndex]) : null,
        winRate: bucket.count ? bucket.wins[costIndex] / bucket.count * 100 : null,
        meanMae: bucket.count ? bucket.maeSum / bucket.count : null,
        worstMae: bucket.count ? bucket.worstMae : null,
      };
    }),
  };
}
