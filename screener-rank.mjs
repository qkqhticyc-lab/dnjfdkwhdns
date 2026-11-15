export const RANK_VERSION = 1;
export const TURNOVER_BASE = { KR: 1e10, US: 2e7, JP: 1e9 };

export function rankInputs(frame) {
  const shortKnown = [frame.close, frame.ema8, frame.ema14, frame.ema21].every(Number.isFinite);
  const mediumKnown = [frame.close, frame.ema21, frame.ema55].every(Number.isFinite);
  return {
    shortAligned: shortKnown ? frame.ema8 > frame.ema14 && frame.ema14 > frame.ema21 && frame.close > frame.ema14 : null,
    mediumAligned: mediumKnown ? frame.ema21 > frame.ema55 && frame.close > frame.ema55 : null,
  };
}

export function rankScreenItem(item) {
  const signal = item.signal;
  if (item.status !== 'ok' || signal?.status !== 'active' || !Number.isFinite(signal.entry) || signal.entry <= 0 || !Number.isFinite(item.price)) return null;
  const gapPct = (item.price / signal.entry - 1) * 100;
  const gap = Math.abs(gapPct);
  const blocked = Number.isFinite(signal.initialStop) && item.price <= signal.initialStop ? '초기 손절선 이하' : Number.isFinite(signal.tp1) && item.price >= signal.tp1 ? 'TP1 이상 이격' : null;
  const location = blocked ? 0 : gap <= 2 ? 25 : gap <= 5 ? 18 : gap <= 8 ? 10 : gap <= 12 ? 4 : 0;
  const age = signal.age;
  const recency = !Number.isFinite(age) ? 0 : age === 0 ? 20 : age <= 2 ? 16 : age <= 4 ? 12 : age <= 9 ? 6 : 0;
  const inputs = item.rankInputs;
  const trend = inputs ? (inputs.shortAligned ? 15 : 0) + (inputs.mediumAligned ? 10 : 0) : item.trend === 'up' ? 10 : 0;
  const average = item.liquidity?.average;
  const ratio = Number.isFinite(average) && TURNOVER_BASE[item.market] ? average / TURNOVER_BASE[item.market] : null;
  const liquid = ratio === null ? 0 : ratio >= 5 ? 15 : ratio >= 2 ? 12 : ratio >= 1 ? 8 : 0;
  const volume = item.volumeRatio;
  const volumePoints = !Number.isFinite(volume) ? 0 : volume >= 2 ? 15 : volume >= 1.5 ? 12 : volume >= 1 ? 8 : volume >= .8 ? 4 : 0;
  const components = [
    { label: '진입가 이격', points: location, max: 25, detail: blocked || `${gapPct.toFixed(2)}%` },
    { label: '신호 최근성', points: recency, max: 20, detail: Number.isFinite(age) ? `${age}봉 전` : '미제공' },
    { label: '추세 정렬', points: trend, max: 25, detail: inputs ? `단기 ${inputs.shortAligned ? '정렬' : '미충족'} · 중기 ${inputs.mediumAligned ? '정렬' : '미충족'}` : '이평 상세 집계 전 · 종목 추세 기준' },
    { label: '거래대금', points: liquid, max: 15, detail: ratio === null ? '20봉 평균 미제공' : `시장 기본 기준의 ${ratio.toFixed(1)}배` },
    { label: '거래량', points: volumePoints, max: 15, detail: Number.isFinite(volume) ? `평균 ${volume.toFixed(2)}배` : '미제공' },
  ];
  return { score: components.reduce((sum, component) => sum + component.points, 0), gapPct, blocked, components };
}

export function passesRankFilters(item, { minScore = 0, maxGap = 0, turnoverLimits = {} } = {}) {
  const rank = rankScreenItem(item);
  if (minScore > 0 && (!rank || rank.score < minScore)) return false;
  if (maxGap > 0 && (!rank || Math.abs(rank.gapPct) > maxGap)) return false;
  const turnover = turnoverLimits[item.market];
  return !(turnover > 0) || Number.isFinite(item.liquidity?.average) && item.liquidity.average >= turnover;
}
