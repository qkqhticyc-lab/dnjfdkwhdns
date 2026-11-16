import {buildEntryReview} from './entry-review-core.mjs';
import {formatTarget, formatPriceReason} from './price-display.mjs';

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};

export function entryReviewCard(frames, {currency, timeframe = '1d', stale = false, historical = false, maxRiskPct = 8, quotePrice = null} = {}) {
  const review = buildEntryReview(frames, {stale, historical, maxRiskPct, quotePrice});
  const card = element('section', null, 'guide-entry-review');
  card.dataset.reviewStatus = review.status;
  card.setAttribute('aria-label', '진입 가격과 손실 위험 검토');
  card.append(element('h3', historical ? '이 시점의 진입 검토' : '지금 진입한다면?'));
  card.append(element('strong', review.label, 'entry-review-verdict'));
  const low = formatTarget(review.low, currency), high = formatTarget(review.high, currency);
  card.append(element('div', review.low == null ? '진입 가격 제시 보류' : (low === high ? low : low + ' ~ ' + high) + ' ' + currency, 'entry-review-price'));
  card.append(element('p', review.condition, 'guide-note'));
  const reasons = element('ul', null, 'entry-review-reasons');
  for (const reason of review.reasons.slice(0, 3)) reasons.append(element('li', formatPriceReason(reason, currency)));
  card.append(reasons);
  card.append(element('p', '분석 기준가 ' + formatTarget(review.basis, currency) + ' ' + currency + ' · ' + (review.asOf || '시각 미제공')
    + (review.provisional ? ' · 진행 봉 잠정' : ' · 마감봉') + ' · 실제 체결가 아님', 'guide-note'));
  const burden = review.burden, burdenBox = element('div', null, 'entry-review-burden');
  burdenBox.dataset.burden = burden.level;
  burdenBox.append(element('small', historical ? '이 시점의 진입 부담' : '현재 진입 부담'), element('strong', burden.label));
  const factors = element('ul');
  for (const factor of burden.factors) factors.append(element('li', factor.text));
  if (burden.level === 'normal') factors.append(element('li', '추세·RSI·이격·변동성에서 큰 부담 조건이 감지되지 않았습니다.'));
  if (burden.level === 'unavailable') factors.append(element('li', '가격과 지표가 확인되면 다시 평가합니다.'));
  burdenBox.append(factors);
  const metrics = element('div', null, 'entry-review-current-metrics');
  for (const metric of burden.metrics) metrics.append(element('span', metric.label + ' ' + metric.value));
  burdenBox.append(metrics);
  card.append(burdenBox, element('p', '현재 지표 조건으로 분류한 진입 부담입니다. 손실 빈도는 아래 과거 비교에서 확인합니다.', 'guide-note'));
  const history = review.history, grid = element('div', null, 'entry-review-risk-grid');
  const usable = review.status !== 'unavailable' && history.status === 'available';
  const period = timeframe === '4h' ? '4시간봉 10개' : '일봉 10개';
  if (usable) {
   card.append(element('h4', historical ? '이 시점과 비슷했던 구간의 손실 빈도' : '지금과 비슷했던 구간의 손실 빈도'));
   for (const [key, label, rate, count] of [
    ['loss', period + ' 뒤 손실', history.lossRate, history.lossCount],
    ['drawdown', '중간에 5% 이상 하락', history.drawdownRate, history.drawdownCount],
  ]) {
    const cell = element('div');
    cell.dataset.reviewMetric = key;
    cell.append(element('small', label), element('strong', !usable ? '판단 보류' : rate.toFixed(0) + '%'),
      element('small', !usable ? '비교 구간 ' + history.count + '개 / 최소 ' + history.minimum + '개' : history.count + '개 중 ' + count + '개'));
    grid.append(cell);
  }
   card.append(grid, element('p', '같은 종목의 과거 손실 빈도 · 비용 제외', 'guide-note'));
  } else card.append(element('p', '과거 ' + period + ' 비교 ' + history.count + '개 / 최소 ' + history.minimum + '개 · 손실 통계 집계 대기', 'guide-note entry-review-history-pending'));
  const details = element('details', null, 'entry-review-method');
  details.append(element('summary', '비교 기준과 계산 방법'));
  details.append(element('p', '진입 판단은 추세·RSI·거래량·저항·손절폭 조건을 사용합니다. 대기 가격은 기준가에서 2ATR 또는 손절폭 한도 중 좁은 범위 안의 지지·저항만 제시합니다. 해당 가격 도달만으로 진입 조건이 충족되지는 않습니다.'));
  details.append(element('p', '진입 부담 높음은 가격·EMA8의 EMA21 하회, RSI 40 미만 또는 70 이상, EMA21 위 2ATR 초과, ATR/가격 5% 이상, 설정 손절폭 초과 중 하나가 있거나 주의 조건이 3개 이상일 때입니다. 그 외 혼조·RSI 50 미만·ATR 3% 이상·평균 거래량 0.8배 미만·저항까지 1.5R 미만은 주의로 분류합니다. 조건이 없으면 보통입니다. 확률로 보정한 모형은 아니며 실적·뉴스·시장 급변은 반영하지 않습니다.'));
  details.append(element('p', '같은 종목·같은 봉 주기에서 EMA 배열, RSI 구간(40·55·70 경계), EMA21과의 ATR 이격 구간(0·1·2 경계)이 같고 ATR/가격이 현재의 0.5~2배인 과거 봉을 비교합니다.'));
  details.append(element('p', '해당 봉 종가를 기준으로 다음 10개 마감봉을 관찰합니다. 10번째 종가가 기준가보다 낮으면 손실, 중간 저가가 5% 이상 낮으면 하락으로 셉니다. 회복한 경우에도 중간 하락에는 포함합니다. 손절·익절 실행 및 비용은 반영하지 않습니다.'));
  details.append(element('p', '관찰 구간이 겹치지 않게 오래된 순서로 선택하고, 진행 봉·미완료 구간은 제외합니다. 현재 조회된 이력만 사용하며 같은 종목의 반복 관측은 독립된 표본이 아닐 수 있습니다. 20개는 표시 최소 기준이며 예측 정확도 보장이 아닙니다.'));
  details.append(element('p', '수신 이력 ' + (history.historyFrom || '—') + ' ~ ' + (history.historyThrough || '—') + ' · 비교 관찰 ' + (history.from || '—') + ' ~ ' + (history.through || '—')));
  card.append(details);
  return card;
}
