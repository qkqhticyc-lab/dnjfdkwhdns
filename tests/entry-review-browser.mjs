import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE);
const base = process.env.TEST_SITE_URL || 'http://127.0.0.1:5183/preview/';
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const bundle = await build({stdin: {contents: "import {entryReviewCard} from './entry-review.js'; window.renderReview=(frames,options)=>document.querySelector('main').replaceChildren(entryReviewCard(frames,options));", resolveDir: process.cwd()}, bundle: true, write: false, format: 'esm'});
const css = await readFile('chart-guide.css', 'utf8');
const sampleFrames = Array.from({length: 221}, (_, index) => {
  const origin = index % 11 === 0, block = Math.floor(index / 11);
  return {asOf: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), open: 100,
    close: !origin && index % 11 === 10 && block % 2 === 0 ? 96 : origin ? 100 : 102,
    high: 104, low: !origin && block % 4 === 0 ? 94 : 96, atr: 4,
    ema8: 99, ema21: 98, ema55: 97, rsi: origin ? 60 : 20, volumeRatio: 1.5};
});
const bars = Array.from({length: 400}, (_, index) => {
  const close = 100000 + index * 60 + Math.sin(index / 9) * 3500;
  return {date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    asOf: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    open: close - 100, close, high: close + 800, low: close - 800, volume: 1000000};
});
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({viewport: {width, height: 1000}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/review-fixture.html', route => route.fulfill({contentType: 'text/html', body: '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="review-fixture.css"><style>body{margin:0;font-family:Arial,sans-serif}main{max-width:360px;margin:auto;padding:8px;box-sizing:border-box}</style><main></main><script type="module" src="review-fixture.js"></script></html>'}));
    await page.route('**/review-fixture.js', route => route.fulfill({contentType: 'application/javascript', body: bundle.outputFiles[0].text}));
    await page.route('**/review-fixture.css', route => route.fulfill({contentType: 'text/css', body: css}));
    await page.goto(base + 'review-fixture.html');
    await page.waitForFunction(() => typeof window.renderReview === 'function');
    for (const currency of ['KRW', 'USD', 'JPY']) {
      await page.evaluate(({frames, currency}) => window.renderReview(frames, {currency}), {frames: sampleFrames, currency});
      assert.equal(await page.locator('[data-review-metric=loss] strong').textContent(), '50%');
      assert.equal(await page.locator('[data-review-metric=drawdown] strong').textContent(), '25%');
      assert.match(await page.locator('.guide-entry-review').textContent(), /20개 중 10개/);
    }
    await page.screenshot({path: 'outputs/entry-review-' + width + '.png'});
    await page.evaluate(frames => window.renderReview(frames.slice(-80), {currency: 'KRW', timeframe: '4h'}), sampleFrames);
    assert.equal(await page.locator('[data-review-metric=loss]').count(), 0);
    assert.match(await page.locator('.entry-review-history-pending').textContent(), /4시간봉 10개/);
    assert.equal(await page.locator('.entry-review-burden>strong').textContent(), '주의');
    await page.evaluate(frames => window.renderReview(frames, {currency: 'KRW', stale: true}), sampleFrames);
    assert.match(await page.locator('.entry-review-verdict').textContent(), /갱신 대기/);
    assert.equal(await page.locator('[data-review-metric=loss]').count(), 0);
    assert.equal(await page.locator('.entry-review-burden>strong').textContent(), '시세 갱신 대기');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    let failRefresh = false;
    await page.route('**/functions/v1/stock-chart?**', route => {
      if (failRefresh) return route.fulfill({status: 503, json: {}});
      const params = new URL(route.request().url()).searchParams;
      return route.fulfill({json: {market: params.get('market'), symbol: params.get('symbol'), frame: params.get('frame'), currency: 'KRW', exchange: '코스피', liveVersion: 2, bars,
        quote: {price: bars.at(-1).close, asOf: bars.at(-1).asOf, status: 'ok'}, collectedAt: bars.at(-1).asOf,
        guide: {frames: []}, frameInfo: {timeframe: params.get('frame') === 'fourHour' ? '4h' : '1d', timezone: 'Asia/Seoul', status: 'ok', sourceThrough: bars.at(-1).asOf, source: 'https://finance.naver.com'}}});
    });
    await page.route('**/functions/v1/stock-analysis?**', route => route.fulfill({json: {industry: {status: 'unavailable'}}}));
    await page.goto(base + 'charts.html');
    await page.locator('.guide-entry-review').waitFor({state: 'attached', timeout: 30000});
    if (width < 1100) await page.locator('[data-workspace-open=dashboard]').click();
    await page.locator('.guide-entry-review').waitFor({state: 'visible'});
    if (width < 1100) await page.waitForFunction(() => document.querySelector('#chart-panel-dashboard').getBoundingClientRect().top < innerHeight * .6);
    assert.equal(await page.locator('#chart-panel-dashboard .guide-entry-review').count(), 1);
    await page.screenshot({path: 'outputs/entry-review-chart-' + width + '.png'});
    if (width < 1100) await page.locator('#chart-panel-dashboard .chart-panel-heading button').click();
    await page.locator('[data-guide-frame=fourHour]').click();
    await page.waitForFunction(() => document.querySelector('.entry-review-history-pending')?.textContent.includes('4시간봉 10개') || document.querySelector('[data-review-metric=loss]')?.textContent.includes('4시간봉 10개'));
    assert.equal(await page.locator('.guide-entry-review').count(), 1);
    failRefresh = true;
    await page.locator('#chart-refresh').click();
    await page.waitForFunction(() => document.querySelector('.entry-review-verdict')?.textContent === '시세 갱신 대기');
    assert.equal(await page.locator('[data-review-metric=loss]').count(), 0);
    assert.equal(await page.locator('.entry-review-burden>strong').textContent(), '시세 갱신 대기');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS entry review: observed rates, sample suppression, stale data, currencies, dashboard integration, daily/4h, 1440/390/320');
} finally { await browser.close(); }
