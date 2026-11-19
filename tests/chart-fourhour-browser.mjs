import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE);
const base = process.env.TEST_SITE_URL || 'http://127.0.0.1:5183/preview/';
const browser = await chromium.launch({
 executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
 headless: true
});

try {
 for (const stock of [
  {market:'KR', symbol:'005930', currency:'KRW', name:'삼성전자'},
  {market:'US', symbol:'MU', currency:'USD', name:'Micron'},
  {market:'JP', symbol:'8035', currency:'JPY', name:'Tokyo Electron'}
 ]) for(const width of [1440,390]) {
  const page = await browser.newPage({viewport:{width, height:950}, isMobile:width<1100, hasTouch:true});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + 'charts.html?' + new URLSearchParams(stock));
  const plot = page.locator('.guide-plot-scroll svg');
  await plot.waitFor({timeout:45000});
  assert.equal(await page.locator('#chart-range-select').inputValue(), '6mo');
  await page.locator('#chart-range-select').selectOption('3mo');
  const response = page.waitForResponse(response => response.url().includes('/stock-chart?') && response.url().includes('frame=fourHour') && response.ok());
  await page.locator('[data-guide-frame=fourHour]').tap();
  const data = await (await response).json();
  assert.ok(data.bars.length>30,'valid historical candles must remain even when recent intraday slots are missing');
  await page.waitForFunction(() => document.querySelector('#chart-info').textContent.includes('4시간봉'));
  await plot.waitFor();
  const state = () => plot.evaluate(node => ({...node.dataset}));
  assert.equal(await page.locator('#chart-range-select').inputValue(), '1mo');
  assert.ok(Number((await state()).viewCount) < data.bars.length, 'initial four-hour window leaves older bars to pan into');
  assert.equal(await page.locator('#chart-range-select option[value="6mo"]').textContent(), '전체 이력');
  assert.equal(await page.locator('#chart-range-select option[value="3mo"]').isDisabled(), true);
  const cdp = await page.context().newCDPSession(page);
  async function swipe(dx, dy=0) {
   const rect = await plot.boundingBox();
   const x = rect.x + rect.width * .4;
   const y = rect.y + rect.height * .35;
   if(width>=1100){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();return;}
   await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x, y, id:1}]});
   for (let step=1; step<=6; step++) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:x+dx*step/6, y:y+dy*step/6, id:1}]});
   }
   await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
   // Let Chrome's post-swipe click suppression settle before tapping a control.
   await page.waitForTimeout(350);
  }
  const latest = await state();
  await swipe(65);
  const older = await state();
  assert.ok(older.viewStart < latest.viewStart, 'one-finger right swipe reveals older bars');
  assert.equal(older.viewCount, latest.viewCount);
  assert.equal(older.follow, 'false');
  await page.locator('#chart-refresh').tap();
  await page.waitForFunction(() => !document.querySelector('#chart-refresh').disabled);
  assert.equal((await state()).viewStart, older.viewStart, 'refresh preserves historical date anchor');
  await swipe(-65);
  assert.ok((await state()).viewStart > older.viewStart, 'left swipe returns toward recent bars');
  const beforeVertical = await state();
  await swipe(0, 30);
  assert.ok(Number((await state()).priceMin) > Number(beforeVertical.priceMin), 'vertical price pan still works');
  await page.locator('[data-guide-frame=daily]').tap();
  await page.waitForFunction(() => document.querySelector('#chart-info').textContent.includes('일봉'));
  assert.equal(await page.locator('#chart-range-select').inputValue(), '3mo', 'daily range restored independently');
  await page.locator('[data-guide-frame=fourHour]').tap();
  await page.waitForFunction(() => document.querySelector('#chart-info').textContent.includes('4시간봉'));
  assert.equal(await page.locator('#chart-range-select').inputValue(), '1mo');
  await page.locator('#chart-expand').tap();
  await page.waitForTimeout(300);
  const full = await state();
  await swipe(65);
  assert.ok((await state()).viewStart < full.viewStart, 'four-hour swipe works in fullscreen');
  await page.locator('#chart-expand').tap();
  await page.locator('#chart-range-select').selectOption('6mo');
  assert.equal(Number((await state()).viewCount), data.bars.length, 'all-history option shows received bars');
  const rect = await plot.boundingBox();
  const x = rect.x + rect.width * .4;
  const y = rect.y + rect.height * .35;
  const all = await state();
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:x-20,y,id:1},{x:x+20,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:x-60,y,id:1},{x:x+60,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  assert.ok(Number((await state()).viewCount) < Number(all.viewCount), 'pinch expands full-history view');
  const zoomed = await state();
  await swipe(40);
  assert.ok((await state()).viewStart < zoomed.viewStart, 'pinch then one-finger pan works');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS', stock.market,width,'four-hour history, pan both ways, vertical pan, refresh anchor, frame ranges, fullscreen, pinch');
  await page.close();
 }
} finally {
 await browser.close();
}
