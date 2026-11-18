import assert from 'node:assert/strict';
import {WATCH_KEY,watchKey} from '../watchlist-core.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const base=process.env.TEST_SITE_URL||'http://127.0.0.1:5183/preview/';
const items=[{market:'KR',symbol:'005930',name:'삼성전자'},{market:'KR',symbol:'000660',name:'SK하이닉스'},...['AMD','GLD','MPWR','NVDA','AVGO','TSLA','AMZN'].map(symbol=>({market:'US',symbol,name:symbol}))];
const bars=Array.from({length:240},(_,i)=>({asOf:new Date(Date.UTC(2026,0,i+1)).toISOString(),open:80000+i*100,close:80100+i*100,high:80500+i*100,low:79500+i*100,volume:1000000}));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:950},hasTouch:true,isMobile:width<1100}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({key,items})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({schemaVersion:1,items}));},{key:WATCH_KEY,items});
  await page.route('**/functions/v1/stock-chart?**',route=>{
   const p=new URL(route.request().url()).searchParams;
   return route.fulfill({json:{market:p.get('market'),symbol:p.get('symbol'),frame:p.get('frame'),currency:p.get('currency'),exchange:'Test',liveVersion:2,bars,
    quote:{price:bars.at(-1).close,asOf:bars.at(-1).asOf,status:'ok'},collectedAt:bars.at(-1).asOf,guide:{frames:[]},frameInfo:{timeframe:'1d',timezone:'Asia/Seoul',status:'ok',sourceThrough:bars.at(-1).asOf,source:'https://finance.naver.com'}}});
  });
  await page.route('**/functions/v1/stock-analysis?**',r=>r.fulfill({json:{industry:{status:'unavailable'}}}));
  await page.route('**/functions/v1/journal-quotes',r=>r.fulfill({json:{items:r.request().postDataJSON().items.map((i,n)=>({...i,status:'ok',price:100,changePercent:n%2?-1.2:3.21,asOf:new Date().toISOString()}))}}));
  await page.goto(base+'charts.html?market=KR&symbol=005930&currency=KRW');
  await page.locator('.guide-plot-scroll svg').waitFor();
  const picks=page.locator('#chart-watch-list [data-watch-select]'),order=()=>picks.evaluateAll(nodes=>nodes.map(n=>n.dataset.watchSelect));
  const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).items.map(i=>i.market+':'+i.symbol),WATCH_KEY);
  const open=async()=>{if(width<1100){await page.locator('[data-workspace-open=watchlist]').click();await page.waitForFunction(()=>document.querySelector('#chart-panel-watchlist').getBoundingClientRect().bottom<=innerHeight+1);}};
  await open();assert.deepEqual(await order(),items.map(watchKey));
  const title=await page.locator('#chart-title').textContent();
  if(width===1440){
   const first=await picks.first().boundingBox(),third=await picks.nth(2).boundingBox();
   await page.mouse.move(first.x+30,first.y+first.height/2);await page.mouse.down();await page.mouse.move(third.x+30,third.y+third.height*.85,{steps:8});
   assert.equal(await page.locator('.chart-watch-drag-preview').count(),1);assert.equal(await page.locator('.watch-drop-before').getAttribute('data-watch-row'),'US:GLD');
   await page.screenshot({path:'outputs/watchlist-reorder-drag-1440.png'});await page.mouse.up();
  }else{
   const cdp=await context.newCDPSession(page),first=await picks.first().boundingBox(),third=await picks.nth(2).boundingBox();
   const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:1,radiusY:1,force:1}]});
   // A normal swipe scrolls the sheet without reordering.
   await touch('touchStart',first.x+30,first.y+20);await touch('touchMove',first.x+30,first.y-30);await touch('touchEnd');assert.deepEqual(await order(),items.map(watchKey));
   await page.locator('#chart-panel-watchlist').evaluate(n=>{n.scrollTop=0;});
   const a=await picks.first().boundingBox(),b=await picks.nth(2).boundingBox();
   await touch('touchStart',a.x+30,a.y+a.height/2);await page.waitForSelector('.chart-watch-drag-preview');
   await touch('touchMove',b.x+30,b.y+b.height*.85);await page.screenshot({path:'outputs/watchlist-reorder-drag-'+width+'.png'});await touch('touchEnd');
  }
  const expected=['KR:000660','US:AMD','KR:005930',...items.slice(3).map(watchKey)];
  assert.deepEqual(await order(),expected);assert.deepEqual(await saved(),expected);assert.equal(await page.locator('#chart-title').textContent(),title);assert.equal(await page.locator('.chart-watch-drag-preview').count(),0);
  await page.reload();await page.locator('.guide-plot-scroll svg').waitFor();await open();assert.deepEqual(await order(),expected);
  // Keyboard access, cancellation and normal selection remain independent.
  const moved=page.locator('#chart-watch-list [data-watch-select="KR:005930"]');await moved.focus();await page.keyboard.press('Alt+ArrowUp');
  assert.deepEqual((await order()).slice(0,3),['KR:000660','KR:005930','US:AMD']);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.watchSelect),'KR:005930');
  if(width===1440){
   const a=await picks.first().boundingBox(),b=await picks.nth(4).boundingBox(),before=await order();await page.mouse.move(a.x+30,a.y+15);await page.mouse.down();await page.mouse.move(b.x+30,b.y+25,{steps:6});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await order(),before);assert.deepEqual(await saved(),before);
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'내보내기',exact:true}).click();const file=await download;const stream=await file.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()).items.map(watchKey),before);
   const more=Array.from({length:30},(_,i)=>({market:'US',symbol:'TEST'+i,name:'Test '+i}));
   await page.locator('#chart-watch-import').setInputFiles({name:'watch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schemaVersion:1,items:more}))});await page.waitForFunction(()=>document.querySelectorAll('#chart-watch-list [data-watch-select]').length===39);
   const head=await picks.first().boundingBox(),sidebar=page.locator('.chart-sidebar'),edge=await sidebar.boundingBox(),firstKey=(await order())[0];
   await page.mouse.move(head.x+30,head.y+15);await page.mouse.down();await page.mouse.move(head.x+30,edge.y+edge.height-5,{steps:12});
   await page.waitForFunction(()=>document.querySelector('.chart-sidebar').scrollTop>120);await page.mouse.up();assert.ok((await order()).indexOf(firstKey)>8);assert.deepEqual(await saved(),await order());
   await sidebar.evaluate(n=>{n.scrollTop=0;});
  }
  // Drag suppression expires; a subsequent tap selects the intended stock.
  await page.waitForTimeout(550);const amd=page.locator('#chart-watch-list [data-watch-select="US:AMD"]');if(width<1100){const box=await amd.boundingBox();await page.touchscreen.tap(box.x+30,box.y+20);}else await amd.click();await page.waitForFunction(()=>document.querySelector('#chart-title').textContent.includes('AMD'));
  if(width<1100)assert.equal(await page.locator('#chart-panel-watchlist').getAttribute('data-open'),null);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS watchlist reorder '+width+': drag/long-press, normal scroll, persistence, keyboard, click and no overflow/errors');await context.close();
 }
}finally{await browser.close();}
