import assert from'node:assert/strict';import{collectLiveChart}from'../live-chart-core.mjs';import{buildTradePlan}from'../trade-plan.mjs';import{writeFile}from'node:fs/promises';
import{entrySnapshot}from'../entry-snapshot.mjs';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE),fixtures={};
for(const frame of['daily','fourHour'])fixtures[frame]=await collectLiveChart({market:'KR',symbol:'007810',currency:'KRW',exchange:'코스피',frame,range:'6mo'});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install();
 await p.route('**/functions/v1/stock-search?**',r=>r.fulfill({json:{items:[{market:'KR',symbol:'007810',currency:'KRW',exchange:'코스피',name:'코리아써키트'}]}}));
 await p.route('**/functions/v1/stock-chart?**',r=>{const u=new URL(r.request().url()),frame=u.searchParams.get('frame')||'daily';return r.fulfill({json:{...fixtures[frame],symbol:u.searchParams.get('symbol')}});});
 await p.route('**/functions/v1/stock-analysis?**',r=>r.fulfill({json:{industry:{status:'unavailable'}}}));
 await p.goto(process.env.TEST_SITE_URL||'http://127.0.0.1:5183/preview/charts.html');await p.locator('.guide-plan').waitFor();await p.locator('#chart-query').fill('코리아써키트');await p.clock.runFor(350);await p.locator('#chart-suggestions button').click();await p.waitForFunction(()=>document.querySelector('#chart-info').textContent.includes('일봉')&&document.querySelector('#chart-title')?.textContent.includes('007810')&&document.querySelector('.guide-plan'));
 const value=key=>p.locator(`[data-plan-value=${key}] strong`).textContent(),expected=buildTradePlan(fixtures.daily.guide.frames),format=n=>n==null?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:0});
 assert.equal(await value('stop'),format(expected.stop));assert.equal(await value('tp1'),format(expected.tp1));assert.equal(await p.locator('.guide-plan').getAttribute('data-plan-status'),expected.status);
 const signal=entrySnapshot(fixtures.daily.guide,fixtures.daily.guide.frames.at(-1).asOf);assert.equal(await p.locator('.guide-entry').getAttribute('data-entry-status'),signal?.status||'none');if(signal){assert.equal(await p.locator('[data-entry-value=price] strong').textContent(),format(signal.entry)+' KRW');assert.equal(await p.locator('[data-guide-entry-line]').count(),signal.status==='active'?1:0);}
 assert.equal(await p.locator('.guide-legacy').getAttribute('open'),null);assert.equal(await p.locator('[data-guide-target=tp2]').count(),expected.tp2==null?0:1);
 await p.locator('[aria-label="매매 검토 손절폭 한도"]').selectOption('5');assert.equal(await value('stop'),format(expected.stop));await p.clock.runFor(30500);assert.equal(await p.locator('[aria-label="매매 검토 손절폭 한도"]').inputValue(),'5');
 await p.locator('[data-guide-action=back]').click();const end=await p.locator('.guide-plot-scroll svg').getAttribute('data-view-end');assert.equal(await p.locator('.guide-plan').getAttribute('data-plan-as-of'),end);const historic=buildTradePlan(fixtures.daily.guide.frames.filter(v=>v.asOf<=end));assert.equal(await value('stop'),format(historic.stop));await p.locator('[data-guide-action=latest]').click();assert.equal(await value('stop'),format(expected.stop));
 await p.locator('.guide-plan').screenshot({path:'outputs/trade-plan-desktop.png'});
 await p.locator('[data-guide-frame=fourHour]').click();await p.waitForFunction(()=>document.querySelector('#chart-info').textContent.includes('4시간봉')&&document.querySelector('.guide-plan'));
 const four=buildTradePlan(fixtures.fourHour.guide.frames);assert.equal(await value('stop'),format(four.stop));assert.notEqual(await value('stop'),format(expected.stop));
 for(const width of[390,320]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await p.locator('.guide-plan').screenshot({path:'outputs/trade-plan-mobile.png'});assert.deepEqual(errors,[]);await writeFile('outputs/trade-plan-browser.json',JSON.stringify({daily:expected,fourHour:four,errors},null,2));console.log('PASS: actual Korea Circuit daily/4h plan, risk threshold preservation, no synthetic second resistance, historical prefix, collapsed legacy, mobile 320/390, no JS errors');
}finally{await browser.close();}
