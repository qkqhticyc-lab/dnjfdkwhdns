import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomestic, normalizeOverseas, earningsReview, positive, targetChange, plain, settleFeed } from '../scripts/research-core.mjs';

const raw = { nid: '123', itemCode: '005930', itemName: '테스트기업', brokerCode: '57', brokerName: '테스트증권', writeDate: '2026-10-30', title: '3Q26 Review', goalPrice: '120000', prevGoalPrice: '100000', opinionText: 'Buy' };
test('target changes compare explicit previous values and never missing/zero values', () => {
  assert.deepEqual(targetChange(120000, 100000), { direction: 'up', changePercent: 20 });
  assert.deepEqual(targetChange(90000, 100000), { direction: 'down', changePercent: -10 });
  assert.deepEqual(targetChange(100000, 100000), { direction: 'same', changePercent: 0 });
  assert.deepEqual(targetChange(100000, null), { direction: 'unknown', changePercent: null });
  assert.equal(normalizeDomestic({ ...raw, prevGoalPrice: '0' }).direction, 'unknown');
  assert.equal(normalizeDomestic(raw).previousTarget, 100000);
  assert.equal(positive('200,000'), 200000);
  for (const invalid of ['', '-', '100원', 'NaN', '-1', 'Infinity', null]) assert.equal(positive(invalid), null);
});
test('domestic report identity and original links are validated', () => {
  assert.equal(normalizeDomestic(raw).url, 'https://stock.naver.com/research/company/123');
  assert.equal(normalizeDomestic({ ...raw, nid: '../admin' }), null);
  assert.equal(normalizeDomestic({ ...raw, itemCode: '' }), null);
  assert.equal(normalizeDomestic({ ...raw, itemCode: '0011T0' }).symbol, '0011T0');
});
test('realized earnings retain explicit YoY while QoQ is not relabeled', () => {
  const normalized = normalizeDomestic(raw);
  const review = content => earningsReview({ ...raw, content }, normalized);
  assert.deepEqual(review('<p>3Q26 영업이익 1,152억원(YoY +25%) 기록</p>').profit, { amount: 1152, unit: '억원', yoyPercent: 25 });
  assert.equal(review('영업이익 680억원(+37% QoQ)을 기록했다.').profit.yoyPercent, null);
  assert.equal(review('영업이익 680억원(-15% YoY)을 기록했다.').profit.yoyPercent, -15);
  assert.equal(review('영업이익 680억원(흑전)을 기록했다.').profit.yoyPercent, null);
  assert.equal(review('3Q26 영업이익 680억원을 기록했다.').period, '2026년 3분기');
});
test('forecasts and cumulative figures are never shown as actual quarterly profit', () => {
  for (const content of ['4Q26F 영업이익 1,200억원을 기록할 전망이다.', '연간 영업이익 1,200억원 기록', '누적 영업이익 1,200억원 기록', '영업이익 1,200억원을 기록할 것으로 추정한다.']) {
    assert.equal(earningsReview({ ...raw, content }, normalizeDomestic(raw)).profit, null);
  }
  assert.equal(earningsReview({ ...raw, title: '3Q26 Preview', content: '영업이익 120억원 기록 전망' }, normalizeDomestic(raw)), null);
  assert.equal(earningsReview({ ...raw, title: '4Q26 예상 영업이익', content: '3Q26 영업이익 120억원 기록' }, normalizeDomestic(raw)), null);
  assert.equal(earningsReview({ ...raw, content: '<strong>3Q26 Review</strong><p>전체 실적은 양호했다.</p><p>자회사는 영업이익 100억원을 기록했다.</p>' }, normalizeDomestic(raw)).profit, null);
});
test('overseas stock vs market reports retain original metadata without invented prices', () => {
  const report = { rptId: '12345', writeDate: '2026/10/30', secureId: 'abcd123', auth: '테스트증권', writer: '분석가', title: '[인텔 (NAS:INTC)] Earnings Flash' };
  const stock = normalizeOverseas(report);
  assert.equal(stock.symbol, 'INTC'); assert.equal(stock.company, '인텔'); assert.equal(stock.category, 'stock');
  assert.equal(stock.title, 'Earnings Flash'); assert.equal(stock.kind, '실적 리뷰');
  assert.equal('targetPrice' in stock, false);
  assert.equal(normalizeOverseas({ ...report, title: '반도체 산업 동향' }).category, 'market');
  assert.equal(normalizeOverseas({ ...report, secureId: '../bad' }), null);
});
test('failed collection retains last good timestamp and records', () => {
  const previous = { items: [normalizeDomestic(raw)], updatedAt: '2026-10-30T12:00:00Z' };
  const stale = settleFeed(previous, [], Error('HTTP 503'), '2026-10-31T12:00:00Z');
  assert.equal(stale.status, 'stale'); assert.equal(stale.updatedAt, previous.updatedAt); assert.deepEqual(stale.items, previous.items);
  assert.equal(settleFeed(null, [], Error('HTTP 403'), 'now').status, 'unavailable');
  assert.equal(settleFeed(previous, previous.items, null, 'new').updatedAt, 'new');
});
test('source HTML becomes plain text', () => {
  assert.equal(plain('<script>bad()</script><b>제목</b> &amp; 자료 &#40;확인&#41;'), '제목 & 자료 (확인)');
});
