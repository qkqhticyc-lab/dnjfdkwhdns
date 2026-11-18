import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const base=process.env.TEST_SITE_URL||'http://127.0.0.1:5183/preview/';
const names=['indicators','indicator-history','screener','sectors','news'];
const datasets=Object.fromEntries(await Promise.all(names.map(async name=>[name,await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/'+name+'.json').then(response=>response.json())])));
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),template=datasets.news.calendar.items[0];
datasets.news.calendar.items=[...['3.00%','2.00%','1.00%'].map((actual,index)=>({...template,id:'lounge-consensus-'+index,title:'지표 예측 비교 '+index,date:today,time:'00:00',scheduledAt:today+'T00:00:00+09:00',actual,forecast:'2.00%',previous:'2.00%'})),...datasets.news.calendar.items];
const items=[{market:'KR',symbol:'005930',name:'삼성전자',currency:'KRW',exchange:'코스피'},{market:'US',symbol:'NVDA',name:'엔비디아',currency:'USD',exchange:'NASDAQ'}],now=Date.now();
const notification={schemaVersion:1,watched:{'KR:005930':now-86400000,'US:NVDA':now-86400000},settings:{entry:true,tp1:true,tp2:true,exit:true,earnings:true,macro:false},settingsAt:0,items:[{id:'test-entry-alert',kind:'entry',title:'엔비디아 진입 신호',body:'새로운 마감봉 신호',occurredAt:new Date(now).toISOString(),stock:items[1],readAt:0}]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];let failNews=false;
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({items,notification})=>{localStorage.setItem('investment-chart-watchlist-v1',JSON.stringify({schemaVersion:1,items}));localStorage.setItem('investment-notifications-v1',JSON.stringify(notification));},{items,notification});
  for(const name of names)await page.route('**/data/'+name+'.json',route=>route.fulfill(name==='news'&&failNews?{status:503,json:{}}:{json:datasets[name]}));
  await page.goto(base+'lounge.html');
  await page.waitForFunction(()=>document.querySelectorAll('.lounge-quotes strong').length===2&&document.querySelector('#lounge-screen-basis')?.textContent.includes('2026'));
  assert.equal(await page.locator('.lounge-card').count(),6);
  assert.equal(await page.locator('header nav a[aria-current=page]').textContent(),'한눈에');
  assert.ok((await page.locator('#lounge-alert-list').textContent()).includes('엔비디아'));
  assert.ok(await page.locator('.lounge-forecast.lounge-positive').count()>0);
  assert.ok(await page.locator('.lounge-forecast.lounge-negative').count()>0);
  assert.ok(await page.locator('.lounge-forecast:not(.lounge-positive):not(.lounge-negative)').count()>0);
  await page.screenshot({path:'outputs/lounge-'+width+'.png',fullPage:true});
  await page.locator('[data-lounge-market=US]').click();
  assert.equal(await page.locator('[data-lounge-market=US]').getAttribute('aria-pressed'),'true');
  assert.ok((await page.locator('#lounge-quotes').textContent()).includes('S&P 500'));
  await page.locator('#lounge-type').selectOption('pullback');await page.locator('[data-lounge-state=active]').click();
  for(const row of await page.locator('#lounge-signal-list .lounge-stock-info small').allTextContents())assert.match(row,/눌림/);
  assert.match(await page.locator('#lounge-screen-link').getAttribute('href'),/market=US/);
  await page.locator('#lounge-open-alerts').click();
  assert.equal(await page.locator('#notification-panel').isVisible(),true);
  await page.getByRole('button',{name:'알림 닫기',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('investment-notification-read',{detail:{id:'test-entry-alert'}})));
  assert.ok(!(await page.locator('#lounge-alert-list').textContent()).includes('엔비디아 진입 신호'));
  const previousNews=await page.locator('#lounge-news-list').textContent();
  await page.waitForFunction(()=>!document.getElementById('lounge-refresh').disabled);
  failNews=true;await page.locator('#lounge-refresh').click();
  await page.waitForFunction(()=>document.getElementById('lounge-status').textContent.includes('지연'));
  assert.equal(await page.locator('#lounge-news-list').textContent(),previousNews);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,signals:await page.locator('#lounge-signal-list .lounge-stock-row').count(),news:await page.locator('.lounge-news-row').count(),calendar:await page.locator('.lounge-calendar-row').count(),errors}));
  await page.close();
 }
}finally{await browser.close();}
