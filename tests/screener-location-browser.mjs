import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const base=process.env.TEST_SITE_URL||'http://127.0.0.1:5183/preview/';
const date=new Date().toISOString().slice(0,10),previous=new Date(Date.now()-86400000).toISOString().slice(0,10);
const stock=(symbol)=>({market:'US',symbol,name:symbol,currency:'USD',exchange:'NASDAQ',status:'ok',asOf:date,price:101,changePercent:1,rsi:60,trend:'up',state:'active',volumeRatio:2,liquidity:{average:1e9,median:1e9,activeDays:20},rankInputs:{shortAligned:true,mediumAligned:true},
 signal:{status:'active',kind:'breakoutEntry',entryType:'breakout',asOf:previous,referenceAt:date,age:1,entry:100,initialStop:94,tp1:110,tp2:120,tp1Hit:false,tp2Hit:false},
 locationInputs:{version:1,asOf:date,signalAt:previous,kind:'breakoutEntry',atr:4,open:100,low:99,ema21:97,support:98,supportLabel:'신호 당시 20봉 고가',fixedSupport:true,previousHigh:102,stop:95}});
const near=stock('NEAR'),retest=stock('RETEST'),chase=stock('CHASE'),target=stock('TARGET'),damaged=stock('DAMAGED'),waiting=stock('WAIT'),unknown=stock('UNKNOWN'),old=stock('OLD'),candidate=stock('CANDIDATE');
retest.price=99;Object.assign(retest.locationInputs,{open:98.5,low:97.5});chase.price=106;target.signal.tp1Hit=true;damaged.signal.status='closed';damaged.state='closed';waiting.price=103;unknown.locationInputs=null;old.asOf=previous;old.locationInputs.asOf=previous;old.signal.referenceAt=previous;
candidate.signal=null;candidate.state='none';candidate.candidate={state:'watch',asOf:date,age:0,lower:90,upper:100,initialDropPct:20,currentDropPct:21,expiresIn:4,blocked:['거래량 회복 대기'],newLow:false};
const data={schemaVersion:1,rulesVersion:'independent-v3',candidateRulesVersion:1,bounceRulesVersion:1,patternRulesVersion:1,universeScope:'all-provider-listed',collectedAt:new Date().toISOString(),coverage:[{label:'나스닥',requested:9,status:'ok'}],items:[near,retest,chase,target,damaged,waiting,unknown,old,candidate]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const width of [1440,390,320]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];let fail=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/screener.json',r=>r.fulfill(fail?{status:503,json:{}}:{json:data}));
 await page.route('**/data/sectors.json',r=>r.fulfill({json:{schemaVersion:1,collectedAt:data.collectedAt,items:[]}}));
 await page.goto(base+'screener.html');
 const chips=page.locator('.screen-location-options');await chips.waitFor();await page.waitForFunction(()=>document.querySelectorAll('#screen-body tr').length===7);
 const choose=async value=>chips.locator('[data-value="'+value+'"]').click();
 await choose('nearby');assert.equal(await page.locator('#screen-body tr').count(),2);assert.equal(await page.locator('#screen-state').inputValue(),'all');
 assert.deepEqual((await page.locator('#screen-body tr').evaluateAll(rows=>rows.map(r=>r.dataset.location))).sort(),['near','retest']);
 for(const [code,total]of [['near',1],['retest',1],['chase',1],['target',1],['damaged',1],['waiting',1],['unknown',2]]){
  await choose(code);assert.equal(await page.locator('#screen-body tr').count(),total,code);
  assert.ok((await page.locator('#screen-body tr').evaluateAll(rows=>rows.map(r=>r.dataset.location))).every(x=>x===code));
 }
 await choose('near');await page.locator('#screen-body .screen-location-cell summary').click();assert.match(await page.locator('#screen-body .screen-location-cell').textContent(),/진입가 대비.*ATR.*98\.00 USD.*추적 손절선.*95\.00 USD/);
 assert.match(await page.locator('#screen-body a').getAttribute('href'),/symbol=NEAR/);
 await page.locator('#screen-query').fill('missing');assert.equal(await page.locator('#screen-empty').isVisible(),true);await page.locator('#screen-query').fill('');
 await page.locator('#v2-settings>summary').click();await page.locator('[data-option=commonVolume]').selectOption('2');assert.equal(await page.locator('#screen-body tr').count(),1);
 await page.locator('#screen-query').fill('NEAR');await choose('all');assert.equal(await page.locator('#screen-body tr').count(),1);await page.locator('#screen-query').fill('');
 await page.locator('[data-value=reboundCandidate]').click();assert.equal(await chips.isVisible(),false);assert.equal(await page.locator('#screen-location-help').isVisible(),false);assert.equal(await page.locator('#screen-body tr').count(),1);
 await page.locator('[data-value=confirmed]').click();assert.equal(await chips.isVisible(),true);
 await choose('nearby');fail=true;await page.locator('#screen-refresh').click();await page.waitForFunction(()=>!document.querySelector('#screen-refresh').disabled);assert.equal(await page.locator('#screen-body tr').count(),2);assert.match(await page.locator('#screen-warning').textContent(),/이전 결과/);
 await chips.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 for(const b of await chips.locator('button').all()){const box=await b.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);}
 await page.screenshot({path:'outputs/screener-location-'+width+'.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS screener location '+width);await page.close();
}}finally{await browser.close();}
