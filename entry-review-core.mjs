import {buildTradePlan} from './trade-plan.mjs';

export const REVIEW_HORIZON = 10;
export const REVIEW_MIN_SAMPLES = 20;
const finite = Number.isFinite;
const bucket = (value, boundaries) => boundaries.filter(boundary => value >= boundary).length;

function comparisonState(frame) {
  if (!frame || ![frame.close, frame.ema8, frame.ema21, frame.ema55, frame.rsi, frame.atr].every(finite)
    || frame.close <= 0 || frame.ema21 <= 0 || frame.atr <= 0) return null;
  const trend = frame.close > frame.ema21 && frame.ema8 > frame.ema21 && frame.ema21 > frame.ema55 ? 'up'
    : frame.close < frame.ema21 && frame.ema8 < frame.ema21 && frame.ema21 < frame.ema55 ? 'down' : 'mixed';
  return {
    key: [trend, bucket(frame.rsi, [40, 55, 70]), bucket((frame.close - frame.ema21) / frame.atr, [0, 1, 2])].join(':'),
    volatility: frame.atr / frame.close,
  };
}

export function comparableEntryHistory(frames) {
  const current = frames.at(-1), state = comparisonState(current);
  const result = {status: 'insufficient', horizon: REVIEW_HORIZON, minimum: REVIEW_MIN_SAMPLES,
    count: 0, lossCount: 0, drawdownCount: 0, lossRate: null, drawdownRate: null, from: null, through: null,
    historyFrom: frames[0]?.asOf ?? null, historyThrough: current?.asOf ?? null, provisional: !!current?.provisional};
  if (!state) return result;
  let previousEnd = -1;
  for (let index = 0; index + REVIEW_HORIZON < frames.length - 1; index++) {
    if (index <= previousEnd) continue;
    const origin = frames[index], candidate = comparisonState(origin);
    if (origin.provisional || !candidate || candidate.key !== state.key
      || candidate.volatility < state.volatility / 2 || candidate.volatility > state.volatility * 2) continue;
    const path = frames.slice(index + 1, index + REVIEW_HORIZON + 1);
    if (path.some(bar => bar.provisional || ![bar.close, bar.low, bar.high].every(finite)
      || bar.low <= 0 || bar.high < bar.low || bar.close < bar.low || bar.close > bar.high)) continue;
    result.count++;
    if (path.at(-1).close < origin.close) result.lossCount++;
    if (Math.min(...path.map(bar => bar.low)) <= origin.close * .95) result.drawdownCount++;
    result.from ??= origin.asOf;
    result.through = path.at(-1).asOf;
    previousEnd = index + REVIEW_HORIZON;
  }
  if (result.count >= REVIEW_MIN_SAMPLES) {
    result.status = 'available';
    result.lossRate = result.lossCount / result.count * 100;
    result.drawdownRate = result.drawdownCount / result.count * 100;
  }
  return result;
}

export function currentEntryBurden(frames, plan, {stale = false, historical = false, quotePrice = null} = {}) {
  const last = frames.at(-1);
  const empty = {level: 'unavailable', label: '지표 준비 중', factors: [], metrics: []};
  if (stale) return {...empty, label: '시세 갱신 대기'};
  if (!last || ![last.close, last.ema8, last.ema21, last.atr, last.rsi].every(finite)
    || last.close <= 0 || last.ema21 <= 0 || last.atr <= 0) return empty;
  if (!historical && finite(quotePrice) && Math.abs(quotePrice - last.close) > Math.max(last.close * .005, last.atr * .25))
    return {...empty, label: '가격 동기화 대기'};
  const distance = (last.close / last.ema21 - 1) * 100;
  const atrPct = last.atr / last.close * 100;
  const closed = frames.findLast(bar => !bar.provisional);
  const factors = [];
  if (last.close < last.ema21 && last.ema8 < last.ema21) factors.push({severe: true, text: '가격과 단기 이평선이 EMA21 아래 · 추세 회복 대기'});
  else if (last.close < last.ema21 || last.ema8 < last.ema21) factors.push({text: '단기 추세 혼조 · EMA21 회복 확인 필요'});
  if (last.rsi < 40) factors.push({severe: true, text: 'RSI ' + last.rsi.toFixed(0) + ' · 하락 모멘텀 지속'});
  else if (last.rsi < 50) factors.push({text: 'RSI ' + last.rsi.toFixed(0) + ' · 상승 모멘텀 약함'});
  if (last.rsi >= 70) factors.push({severe: true, text: 'RSI ' + last.rsi.toFixed(0) + ' · 과열 구간'});
  if (last.close - last.ema21 > 2 * last.atr) factors.push({severe: true, text: 'EMA21에서 2ATR 이상 상승 · 추격 진입 부담'});
  if (atrPct >= 5) factors.push({severe: true, text: '한 봉 ATR ' + atrPct.toFixed(1) + '% · 큰 가격 변동'});
  else if (atrPct >= 3) factors.push({text: '한 봉 ATR ' + atrPct.toFixed(1) + '% · 변동성 주의'});
  if (finite(closed?.volumeRatio) && closed.volumeRatio < .8) factors.push({text: '마감 거래량 평균의 ' + closed.volumeRatio.toFixed(1) + '배 · 매수세 확인 필요'});
  if (finite(plan?.obstacleRr) && plan.obstacleRr < 1.5) factors.push({text: '가까운 저항까지 손익비 ' + plan.obstacleRr.toFixed(2) + ' · 상승 여유 제한'});
  if (finite(plan?.riskPct) && plan.riskPct > plan.maxRiskPct) factors.push({severe: true, text: '현재 기준 손절폭 ' + plan.riskPct.toFixed(1) + '% · 설정 한도 초과'});
  const level = factors.some(factor => factor.severe) || factors.length >= 3 ? 'high' : factors.length ? 'caution' : 'normal';
  return {level, label: {high: '높음', caution: '주의', normal: '보통'}[level], factors,
    metrics: [
      {label: 'EMA21 이격', value: (distance > 0 ? '+' : '') + distance.toFixed(1) + '%'},
      {label: '한 봉 변동폭 · ATR', value: atrPct.toFixed(1) + '%'},
    ]};
}

export function buildEntryReview(frames, {maxRiskPct = 8, stale = false, historical = false, quotePrice = null} = {}) {
  const last = frames.at(-1), plan = buildTradePlan(frames, {maxRiskPct});
  const review = {status: 'wait', label: '추세 회복 대기', low: null, high: null,
    basis: last?.close ?? null, asOf: last?.asOf ?? null, provisional: !!last?.provisional,
    condition: '가격만으로 진입하지 않고 추세와 마감봉 회복을 먼저 확인합니다.',
    reasons: [...plan.reasons], plan, history: comparableEntryHistory(frames), historical,
    burden: currentEntryBurden(frames, plan, {stale, historical, quotePrice})};
  if (stale) return {...review, status: 'unavailable', label: '시세 갱신 대기', condition: '이전 조회 자료입니다. 새 시세가 확인되면 다시 평가합니다.'};
  if (!historical && finite(quotePrice) && finite(last?.atr) && Math.abs(quotePrice - last.close) > Math.max(last.close * .005, last.atr * .25))
    return {...review, status: 'unavailable', label: '가격 동기화 대기', condition: '최신 시세와 차트 마지막 봉 가격의 차이가 커서 현재 진입 판단을 보류합니다.'};
  if (plan.status === 'unavailable' || !plan.context?.ready) return {...review, status: 'unavailable', label: '판단 자료 부족'};
  if (plan.context.regime === 'down' || plan.context.rsi < 45) return review;
  if (plan.status === 'review' && !last.provisional) return {...review, status: 'review', label: '현재 가격대 검토',
    low: plan.entry, high: plan.entry, condition: '종합 조건을 충족한 마감봉 가격입니다. 주문 전 현재 시세와 손절폭을 다시 확인합니다.'};
  const aligned = ['up', 'strongUp'].includes(plan.context.regime);
  const nearDistance = Math.min(plan.atr * 2, plan.entry * maxRiskPct / 100);
  if (aligned && finite(plan.pullback?.low) && finite(plan.pullback?.high) && plan.pullback.low > 0
    && plan.entry - plan.support.value <= nearDistance) return {...review, label: plan.support.kind === 'EMA21 참고선' ? '이평선 지지 확인 대기' : '눌림 확인 후 검토',
    low: plan.pullback.low, high: plan.pullback.high,
    condition: '이 가격대에서 지지를 지킨 뒤 EMA14 위 마감과 평균 이상 거래량을 확인합니다. 도달 시 손절폭·저항을 다시 계산합니다.'};
  if (aligned && plan.obstacle && plan.obstacle.value - plan.entry <= nearDistance && !plan.extended && plan.context.rsi < 70) return {...review, label: '저항 돌파·재확인 대기',
    low: plan.obstacle.value, high: plan.obstacle.value,
    condition: '이 저항 위 마감과 평균 이상 거래량을 확인하고, 되돌림에서도 지지를 지키는지 봅니다. 확인 후 진입가를 다시 계산합니다.'};
  return {...review, label: last.provisional ? '마감 확인 대기' : plan.extended || plan.context.rsi >= 70 ? '추격 진입 대기' : '진입 조건 대기'};
}
