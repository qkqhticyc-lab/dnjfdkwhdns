import test from 'node:test';
import assert from 'node:assert/strict';
import {comparableEntryHistory, buildEntryReview, currentEntryBurden} from '../entry-review-core.mjs';

function samples(count = 20) {
  const frames = [];
  for (let block = 0; block < count; block++) {
    frames.push({close: 100, low: 99, high: 101, atr: 4, ema8: 99, ema21: 98, ema55: 97, rsi: 60});
    for (let offset = 1; offset <= 10; offset++) frames.push({close: offset === 10 && block % 2 === 0 ? 96 : 102,
      low: block % 4 === 0 ? 94 : 96, high: 104, atr: 4, ema8: 99, ema21: 98, ema55: 97, rsi: 20});
  }
  frames.push({...frames[0]});
  return frames.map((bar, index) => ({...bar, open: bar.close, volumeRatio: 1.5, asOf: new Date(Date.UTC(2025, 0, index + 1)).toISOString()}));
}
const rising = () => Array.from({length: 80}, (_, index) => ({asOf: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, atr: 3,
  ema8: 100 + index, ema21: 98 + index, ema55: 95 + index, rsi: 60, volumeRatio: 1.5}));

test('counts terminal losses separately from 5% drawdowns, including later recovery', () => {
  const result = comparableEntryHistory(samples());
  assert.equal(result.count, 20);
  assert.equal(result.lossRate, 50);
  assert.equal(result.drawdownRate, 25);
  const recovered = samples(); recovered[10].close = 102;
  assert.equal(comparableEntryHistory(recovered).lossCount, 9);
  assert.equal(comparableEntryHistory(recovered).drawdownCount, 5);
});
test('never reports zero probability for insufficient or missing inputs', () => {
  for (const frames of [[], samples(19), [{close: 100}]]) {
    assert.equal(comparableEntryHistory(frames).lossRate, null);
    assert.equal(comparableEntryHistory(frames).drawdownRate, null);
  }
});
test('all qualifying bars still produce nonoverlapping observation windows', () => {
  const frames = samples().map(bar => ({...bar, close: 100, rsi: 60}));
  assert.equal(comparableEntryHistory(frames).count, 20);
});
test('unfinished or invalid future bars exclude their observation window', () => {
  const frames = samples(); frames[5].provisional = true; frames[15].low = null;
  assert.equal(comparableEntryHistory(frames).count, 18);
  const current = samples(); current.at(-1).provisional = true;
  assert.equal(comparableEntryHistory(current).count, 20);
  assert.equal(comparableEntryHistory(current).provisional, true);
});
test('comparison requires same trend, RSI, ATR distance and similar volatility', () => {
  for (const changes of [{rsi: 80}, {ema21: 101}, {atr: .5}]) {
    const frames = samples(); Object.assign(frames.at(-1), changes);
    assert.equal(comparableEntryHistory(frames).count, 0);
  }
});
test('historical prefix results never depend on appended future outcomes', () => {
  const frames = samples(), baseline = comparableEntryHistory(frames);
  frames.push(...samples(5));
  assert.deepEqual(comparableEntryHistory(frames.slice(0, 221)), baseline);
});
test('stale and unsynchronized quotes cannot produce a current entry price', () => {
  const frames = rising();
  for (const options of [{stale: true}, {quotePrice: 300}]) {
    const review = buildEntryReview(frames, options);
    assert.equal(review.status, 'unavailable'); assert.equal(review.low, null);
  }
  assert.notEqual(buildEntryReview(frames, {quotePrice: 300, historical: true}).label, '가격 동기화 대기');
});
test('weak or falling conditions withhold a buy price even when RSI is oversold', () => {
  const frames = rising(); frames.at(-1).rsi = 25;
  const review = buildEntryReview(frames);
  assert.equal(review.label, '추세 회복 대기'); assert.equal(review.low, null);
  assert.equal(buildEntryReview([]).status, 'unavailable');
});
test('conditional pullback price stays below current price and requires confirmation', () => {
  const frames = rising(); frames[77].low = 174; frames.at(-1).rsi = 78;
  const review = buildEntryReview(frames);
  assert.equal(review.label, '눌림 확인 후 검토');
  assert.ok(review.low <= review.high && review.high < review.basis);
  assert.match(review.condition, /확인/);
  frames.at(-1).provisional = true;
  assert.notEqual(buildEntryReview(frames).status, 'review');
});
test('distant support is not presented as a practical entry price', () => {
  const frames = rising(); frames[65].low = 155; frames.at(-1).rsi = 78;
  assert.equal(buildEntryReview(frames).low, null);
});
test('qualified close can be reviewed but provisional close cannot', () => {
  const frames = rising(); frames[65].low = 155; frames[70].high = 190;
  const review = buildEntryReview(frames);
  assert.equal(review.status, 'review');
  assert.equal(review.low, frames.at(-1).close);
  frames.at(-1).provisional = true;
  assert.notEqual(buildEntryReview(frames).status, 'review');
});
test('short 4h histories show indicator burden even without historical matches or EMA55', () => {
  const frames = rising().slice(-25).map(bar => ({...bar, ema55: null}));
  frames.at(-1).rsi = 76;
  const review = buildEntryReview(frames);
  assert.equal(review.history.lossRate, null);
  assert.equal(review.burden.level, 'high');
  assert.match(review.burden.factors.map(factor => factor.text).join(' '), /과열/);
  assert.equal(review.burden.metrics.length, 2);
});
test('burden distinguishes normal, caution, high and stale states', () => {
  const frames = rising();
  assert.equal(currentEntryBurden(frames, null).level, 'normal');
  frames.at(-1).rsi = 48;
  assert.equal(currentEntryBurden(frames, null).level, 'caution');
  frames.at(-1).rsi = 28;
  assert.equal(currentEntryBurden(frames, null).level, 'high');
  assert.equal(currentEntryBurden(frames, null, {stale: true}).level, 'unavailable');
  assert.equal(currentEntryBurden(frames, null, {quotePrice: 300}).level, 'unavailable');
  frames.at(-1).atr = null;
  assert.equal(currentEntryBurden(frames, null).level, 'unavailable');
});
