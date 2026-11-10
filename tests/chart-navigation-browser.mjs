import assert from'node:assert/strict';import{collectLiveChart}from'../live-chart-core.mjs';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE),fixture=await collectLiveChart({market:'KR',symbol:'005930',currency:'KRW',exchange:'코스피',frame:'daily',range:'6mo'}),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let calls=0;p.on('pageerror',e=>errors.push(e.message));await p.clock.install();
 await p.route('**/functions/v1/stock-chart?**',r=>{calls++;return r.fulfill({json:{...fixture,collectedAt:new Date(Date.now()+calls*1000).toISOString()}});});
 await p.route('**/functions/v1/stock-analysis?**',r=>r.fulfill({json:{...fixture,technical:{asOf:fixture.asOf,averages:[]},industry:{status:'unavailable'}}}));
 await p.goto(process.env.TEST_SITE_URL||'http://127.0.0.1:5183/preview/charts.html');const plot=p.locator('.guide-plot-scroll svg');await plot.waitFor();await plot.scrollIntoViewIfNeeded();
 const state=()=>plot.evaluate(e=>({...e.dataset})),span=s=>+s.priceMax-(+s.priceMin),drag=async(x,y,dx,dy)=>{await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y+dy,{steps:12});await p.mouse.up();};
 let a=await state(),box=await plot.boundingBox();await drag(box.x+box.width*.5,box.y+box.height*.4,180,0);let b=await state();assert.ok(b.viewStart<a.viewStart,'drag right reveals older bars');assert.equal(b.viewCount,a.viewCount);assert.equal(b.follow,'false');
 // The historical event list must not display events from beyond the viewport.
 const eventDates=await p.locator('.guide-events summary').allTextContents();assert.ok(eventDates.every(t=>t.slice(0,10)<=b.viewEnd.slice(0,10)));
 const axis=await p.locator('[data-price-axis]').boundingBox();await drag(axis.x+axis.width/2,axis.y+axis.height/2,0,65);let c=await state();assert.ok(span(c)>span(b)*1.1,'axis drag increases price span');assert.equal(c.viewStart,b.viewStart);
 const pinned=await state(),oldCalls=calls;await p.clock.runFor(30500);await p.waitForFunction(()=>document.querySelector('#chart-status').textContent==='');assert.ok(calls>oldCalls);assert.equal((await state()).viewStart,pinned.viewStart);assert.equal((await state()).priceMin,pinned.priceMin);assert.equal((await state()).priceMax,pinned.priceMax);
 box=await plot.boundingBox();await p.mouse.move(box.x+box.width*.5,box.y+box.height*.4);await p.mouse.wheel(0,-200);await p.clock.runFor(250);assert.ok(+(await state()).viewCount<+c.viewCount,'wheel zooms time');
 const axis2=await p.locator('[data-price-axis]').boundingBox(),before=await state();await p.mouse.move(axis2.x+axis2.width/2,axis2.y+axis2.height/2);await p.mouse.wheel(0,-200);await p.clock.runFor(250);assert.ok(span(await state())<span(before),'wheel on price axis zooms price');
 const manual=await state();await p.locator('[data-price-axis]').dblclick();assert.notEqual((await state()).priceMin,manual.priceMin,'axis double click resets scale');
 await p.locator('[data-guide-action=auto-price]').click();assert.notEqual((await state()).priceMin,before.priceMin);
 await p.locator('[data-guide-action=latest]').click();assert.equal((await state()).follow,'true');assert.equal((await state()).viewEnd,fixture.guide.frames.at(-1).asOf);
 await p.locator('[data-guide-action=back]').click();assert.equal((await state()).follow,'false');await p.locator('[data-chart-range="1mo"]').click();assert.equal((await state()).follow,'true');assert.ok(+(await state()).viewCount<30);
 await plot.focus();await p.keyboard.press('PageUp');assert.equal((await state()).follow,'false');const ks=await state();await p.locator('[data-price-axis]').focus();await p.keyboard.press('ArrowUp');assert.ok(span(await state())<span(ks));
 await p.locator('[data-guide-action=latest]').click();await p.locator('[data-guide-action=auto-price]').click();await p.locator('.stock-chart-panel').screenshot({path:'outputs/chart-navigation-desktop.png'});
 await p.setViewportSize({width:390,height:844});await plot.scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);box=await plot.boundingBox();assert.ok(box.width<=390,'price axis remains on-screen');
 const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 const x=box.x+box.width*.5,y=box.y+box.height*.45,first=await state();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+65,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await state()).viewStart<first.viewStart,'single-finger drag pans');
 const beforePinch=await state();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(+(await state()).viewCount<+beforePinch.viewCount,'pinch zooms time');
 await p.screenshot({path:'outputs/chart-navigation-mobile.png'});assert.deepEqual(errors,[]);console.log('PASS: mouse drag; wheel time zoom; axis drag/wheel/keyboard; price reset; date anchoring across refresh; range reset; historical events; mobile touch drag/pinch; no overflow/errors');
}finally{await browser.close();}
