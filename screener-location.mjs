// Location of the latest signal at the last closed daily bar, not a buy rating.
export const LOCATION_VERSION = 1;
export const LOCATION_LABELS = {
  near: '진입가 근처', retest: '재확인 중', chase: '추격 부담',
  target: '목표 도달', damaged: '신호 훼손', waiting: '대기', unknown: '판단 보류',
};
const positive = value => Number.isFinite(value) && value > 0;

export function locationInputs(guide, signal) {
  if (!signal) return null;
  const frames = guide.frames.filter(frame => frame.asOf <= signal.referenceAt);
  const index = frames.findIndex(frame => frame.asOf === signal.asOf), first = frames[index], last = frames.at(-1);
  if (!first || !last) return null;
  const type = signal.entryType;
  const trade = signal.patternType ? last.patternTrades?.[signal.patternType] : last.trade;
  const line = first.pattern?.triangle?.upper;
  const level = type === 'breakout' ? first.high20
    : type === 'triangle' && line ? line.m * index + line.b
    : type === 'boxRetest' ? first.pattern?.box?.top
    : type === 'pullback' ? last.ema14 : type === 'reclaim' ? last.ema21 : null;
  const supportLabel = { breakout: '신호 당시 20봉 고가', triangle: '신호 당시 삼각 상단', boxRetest: '박스 상단', pullback: 'EMA14', reclaim: 'EMA21' }[type] || null;
  const before = frames.slice(index, -1).map(frame => frame.high).filter(positive);
  // An oversold timeout is an ended observation, not a price invalidation.
  const exit = signal.exitAt && guide.events.find(event => event.asOf === signal.exitAt && event.key === (signal.patternType ? 'patternExit' : 'exit') && (signal.patternType ? event.patternType === signal.patternType && event.entryAt === signal.asOf : !event.entryAt));
  return {
    version: LOCATION_VERSION, asOf: last.asOf, signalAt: signal.asOf, kind: signal.kind,
    atr: last.atr, open: last.open, low: last.low, ema21: last.ema21,
    support: positive(level) ? level : null, supportLabel,
    fixedSupport: ['breakout', 'triangle', 'boxRetest'].includes(type),
    previousHigh: before.length ? Math.max(...before) : null,
    stop: trade?.started === signal.asOf ? trade.stop : null,
    timedOut: !!exit && /추적 기간 종료/.test(exit.reason),
  };
}

export function entryLocation(item, { latestDate } = {}) {
  const signal = item.signal, input = item.locationInputs;
  const result = (code, reason, extra = {}) => ({ code, label: LOCATION_LABELS[code], reason, ...extra });
  if (item.status !== 'ok' || !positive(item.price)) return result('unknown', '유효한 마감 가격이 없습니다.');
  if (latestDate && (!item.asOf || item.asOf < latestDate)) return result('unknown', '해당 시장의 최신 마감일보다 종목 자료가 늦습니다.');
  if (!signal) return result('waiting', '아직 비교할 진입 신호가 없습니다.');
  if (!positive(signal.entry) || !['active', 'closed'].includes(signal.status) || signal.provisional) return result('unknown', '확정 진입 신호를 확인할 수 없습니다.');
  if (input?.version !== LOCATION_VERSION || input.asOf !== item.asOf || input.signalAt !== signal.asOf || input.kind !== signal.kind || signal.referenceAt !== item.asOf) return result('unknown', '현재 자리 상세 자료 재검사 대기 중입니다.');
  if (signal.status === 'closed') return input.timedOut
    ? result('waiting', '과매도 반등의 추적 기간이 종료되었습니다.')
    : result('damaged', '기존 전략의 손절·추세 이탈 조건으로 신호가 종료되었습니다.', { targetBeforeExit: !!(signal.tp1Hit || signal.tp2Hit) });
  if (!positive(input.atr) || !positive(signal.initialStop) || !positive(input.stop) || !positive(signal.tp1)) return result('unknown', 'ATR·추적 손절·목표 자료가 부족합니다.');
  const price = item.price, atr = input.atr, gap = price - signal.entry, epsilon = signal.entry * 1e-10;
  const gapPct = gap / signal.entry * 100, gapAtr = gap / atr;
  const common = { gapPct, gapAtr, support: input.support, supportLabel: input.supportLabel, stop: input.stop, atr };
  const out = (code, reason, extra = {}) => result(code, reason, { ...common, ...extra });
  if (price < Math.max(input.stop, signal.initialStop)) return out('damaged', '마감 가격이 추적 손절선 아래입니다.');
  if (input.fixedSupport && positive(input.support) && price < input.support - .5 * atr) return out('damaged', '돌파 기준선보다 0.5ATR 넘게 내려와 돌파 유지 조건이 훼손되었습니다.');
  if (signal.tp1Hit || signal.tp2Hit || price >= signal.tp1) return out('target', signal.tp2Hit || positive(signal.tp2) && price >= signal.tp2 ? '신호 이후 TP2에 도달한 이력이 있습니다.' : '신호 이후 TP1에 도달한 이력이 있습니다. 현재 가격이 내려왔어도 유지됩니다.');
  if (gap > Math.min(atr, signal.entry * .05) + epsilon || positive(input.ema21) && price - input.ema21 > 2 * atr && item.rsi >= 70) return out('chase', '진입가 위 1ATR·5% 중 작은 한도를 넘었거나 RSI70 이상·EMA21 위 2ATR 과열 조건입니다.');
  if (input.fixedSupport && positive(input.support) && price < input.support) return out('waiting', '돌파 기준선 아래입니다. 기준선 회복 확인을 기다립니다.');
  if (signal.age > 0 && positive(input.support) && positive(input.previousHigh) && input.previousHigh > input.support + .5 * atr && Number.isFinite(input.low) && input.low >= input.support - .5 * atr && input.low <= input.support + .25 * atr && price >= input.support && price <= input.support + .5 * atr && price >= input.open) return out('retest', '기준선에서 0.5ATR 이상 상승한 이력 후, 이번 봉이 기준선 부근을 재접촉하고 그 위로 회복했습니다.');
  if (Math.abs(gap) <= Math.min(.5 * atr, signal.entry * .03) + epsilon) return out('near', '진입가 ±0.5ATR·±3% 중 좁은 범위이며 목표 도달·훼손·추격 조건이 없습니다.');
  return out('waiting', gap < 0 ? '진입가 근처 범위 아래입니다. 가격 회복 또는 기준선 재확인을 기다립니다.' : '진입가 근처 범위를 벗어났습니다. 재확인 조건을 기다립니다.');
}

export function matchesLocation(location, selected = 'all') {
  return selected === 'all' || (selected === 'nearby' ? ['near', 'retest'].includes(location.code) : location.code === selected);
}
