import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const site = process.env.TEST_SITE_URL || 'http://127.0.0.1:5183/preview/';
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*tradingview*/**', route => route.abort());
  await page.goto(site, { waitUntil: 'domcontentloaded' });
  await page.locator('.research-row').first().waitFor();
  assert.equal(await page.locator('.research-row').count(), 30);
  await page.locator('#research-more').click();
  assert.equal(await page.locator('.research-row').count(), 60);
  await page.getByRole('button', { name: /^상향 \d/ }).click();
  assert.ok(await page.locator('.research-row').count() > 0);
  assert.equal(await page.locator('.research-row .report-change:not(.up)').count(), 0);
  assert.equal(await page.locator('#research-more').isVisible(), false);
  await page.locator('#research-search').fill('no-such-stock-4821');
  assert.equal(await page.locator('.research-row').count(), 0);
  assert.equal(await page.locator('#research-list .research-empty').count(), 1);
  await page.locator('#research-search').fill('');
  await page.locator('[data-research-tab="overseas"]').click();
  await page.locator('#research-search').fill('INTC');
  assert.ok(await page.locator('.research-row').count() > 0);
  const anchors = await page.locator('.report-title').evaluateAll(nodes => nodes.map(n => ({ href: n.href, target: n.target, rel: n.rel })));
  assert.ok(anchors.every(a => a.href.startsWith('https://rreport.einfomax.co.kr/report/') && a.target === '_blank' && a.rel.includes('noopener')));
  await page.locator('#research-search').fill('');
  await page.locator('[data-research-tab="earnings"]').click();
  await page.getByRole('button', { name: /^영업이익 확인/ }).click();
  assert.ok(await page.locator('.report-metric strong').count() > 0);
  await mkdir('outputs', { recursive: true });
  await page.locator('[data-research-tab="targets"]').click();
  await page.getByRole('button', { name: /^상향 \d/ }).click();
  await page.locator('#reading').screenshot({ path: 'outputs/research-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#reading').screenshot({ path: 'outputs/research-mobile.png' });

  // Inject source text and URL attacks: render as text and remove unsafe links.
  const malicious = { id: 'test', date: '2026-11-01', company: '<img src=x onerror="window.XSS=true">', broker: '테스트', title: '<script>window.XSS=true</script>', url: 'javascript:alert(1)', direction: 'unknown', targetPrice: null };
  const feed = { schemaVersion: 1, targets: { status: 'stale', updatedAt: '2020-01-01T00:00:00Z', items: [malicious] }, earnings: { status: 'ok', items: [] }, overseas: { status: 'ok', items: [] } };
  await page.route('**/data/research.json', route => route.fulfill({ json: feed }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.research-row').waitFor();
  assert.equal(await page.locator('#research-list img, #research-list script, #research-list a').count(), 0);
  assert.equal(await page.evaluate(() => !!window.XSS), false);
  assert.equal(await page.locator('#research-warning').isVisible(), true);
  // A failed reload leaves last known records visible; retry is available.
  await page.unroute('**/data/research.json');
  await page.route('**/data/research.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.locator('#research-retry').click();
  await page.locator('#research-loading').waitFor();
  assert.equal(await page.locator('.research-row').count(), 1);
  assert.equal(await page.locator('#research-retry').isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: real research list, pagination, search, category filters, original links, earnings figures, mobile layout, stale state, source XSS/URL rejection, failed-refresh preservation.');
} finally { await browser.close(); }
