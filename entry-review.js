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
  card.append(element('h4', historical ? '이 시점과 비슷했던 구간의 손실 빈도' : '지금과 비슷했던 구간의 손실 빈도'));
  const history = review.history, grid = element('div', null, 'entry-review-risk-grid');
  const usable = review.status !== 'unavailable' && history.status === 'available';
  const period = timeframe === '4h' ? '4시간봉 10개' : '일봉 10개';
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
  card.append(grid);
  card.append(element('p', review.status === 'unavailable' ? '가격·지표가 확인되면 손실 빈도를 다시 표시합니다.' : usable
    ? '현재 종목의 과거 빈도입니다. 미래에 물릴 확률로 검증된 예측값은 아닙니다.'
    : '비교 표본이 부족해 확률을 표시하지 않습니다. 조회 기간을 늘리면 비교할 이력이 늘어날 수 있습니다.', 'guide-note'));
  const details = element('details', null, 'entry-review-method');
  details.append(element('summary', '비교 기준과 계산 방법'));
  details.append(element('p', '진입 판단은 추세·RSI·거래량·저항·손절폭 조건을 사용합니다. 대기 가격은 기준가에서 2ATR 또는 손절폭 한도 중 좁은 범위 안의 지지·저항만 제시합니다. 해당 가격 도달만으로 진입 조건이 충족되지는 않습니다.'));
  details.append(element('p', '같은 종목·같은 봉 주기에서 EMA 배열, RSI 구간(40·55·70 경계), EMA21과의 ATR 이격 구간(0·1·2 경계)이 같고 ATR/가격이 현재의 0.5~2배인 과거 봉을 비교합니다.'));
  details.append(element('p', '해당 봉 종가를 기준으로 다음 10개 마감봉을 관찰합니다. 10번째 종가가 기준가보다 낮으면 손실, 중간 저가가 5% 이상 낮으면 하락으로 셉니다. 회복한 경우에도 중간 하락에는 포함합니다. 손절·익절 실행 및 비용은 반영하지 않습니다.'));
  details.append(element('p', '관찰 구간이 겹치지 않게 오래된 순서로 선택하고, 진행 봉·미완료 구간은 제외합니다. 현재 조회된 이력만 사용하며 같은 종목의 반복 관측은 독립된 표본이 아닐 수 있습니다. 20개는 표시 최소 기준이며 예측 정확도 보장이 아닙니다.'));
  details.append(element('p', '수신 이력 ' + (history.historyFrom || '—') + ' ~ ' + (history.historyThrough || '—') + ' · 비교 관찰 ' + (history.from || '—') + ' ~ ' + (history.through || '—')));
  card.append(details);
  return card;
}
