import test from 'node:test';import assert from 'node:assert/strict';
import{LIVE_INDICATORS,normalizeLiveIndicator,retainLiveItems,collectLiveIndicators}from'../live-indicators-core.mjs';
import{parseOptionSnapshot}from'../options-core.mjs';import{createRequestCache}from'../edge-cache.mjs';import{collectMarket}from'../scripts/market-core.mjs';
const now=new Date('2026-11-02T16:00:00Z'),def=LIVE_INDICATORS.find(d=>d.id==='vix');
const quote={reutersCode:'.VIX',stockEndType:'index',closePrice:'18.00',compareToPreviousClosePrice:'-1.42',fluctuationsRatio:'-7.31',localTradedAt:'2026-11-02T10:20:00-05:00',delayTime:15,marketStatus:'OPEN'};
const chart={code:'.VIX',infoType:'index',periodType:'day',tradeBaseAt:'20261102',zoneId:'EST5EDT',localDateTimeNow:'20261102102100',lastClosePrice:19.42,priceInfos:[{localDateTime:'20261102101900',currentPrice:18.1},{localDateTime:'20261102102000',currentPrice:18},{localDateTime:'20261102102100',currentPrice:17.99}]};
test('intraday identity/delay/timestamps are preserved, future minutes excluded, missing chart does not erase a valid quote',()=>{
 const r=normalizeLiveIndicator(def,quote,chart,now);assert.equal(r.delayMinutes,15);assert.equal(r.delayLabel,'15분 지연');assert.equal(r.points.length,2);assert.equal(r.quoteAt,quote.localTradedAt);assert.equal(r.timezone,'America/New_York');assert.equal(r.change,-1.42);
 assert.equal(normalizeLiveIndicator(def,quote,null,now).points.length,0);assert.throws(()=>normalizeLiveIndicator(def,{...quote,reutersCode:'.IXIC'},chart,now),/identity/);assert.throws(()=>normalizeLiveIndicator(def,{...quote,closePrice:null},chart,now),/Invalid/);assert.throws(()=>normalizeLiveIndicator(def,{...quote,localTradedAt:'2026-11-04T10:00:00Z'},chart,now),/Invalid/);
 assert.equal(normalizeLiveIndicator(def,quote,{...chart,tradeBaseAt:'20261030',priceInfos:[{localDateTime:'20261030160000',currentPrice:19.42}]},now).points.length,0);
});
test('overnight futures preserve actual cross-midnight timestamps and yield changes use basis points',()=>{
 const w=LIVE_INDICATORS.find(d=>d.id==='wti'),q={result:{reutersCode:w.code,categoryType:'energy',closePrice:'97.10',fluctuations:'-7.02',fluctuationsRatio:'-6.74',localTradedAt:'2026-11-02T09:25:00-06:00',delayTime:10}},c={result:{code:w.code,infoType:'futures',periodType:'day',tradeBaseAt:'20261102',zoneId:'CST6CDT',openTime:'20261101170000',closeTime:'20261102160000',priceInfos:[{localDateTime:'20261101165900',currentPrice:101},{localDateTime:'20261101170000',currentPrice:102},{localDateTime:'20261102092500',currentPrice:97.1}]}};
 const r=normalizeLiveIndicator(w,q,c,now);assert.deepEqual(r.points.map(p=>p.at),['20261101170000','20261102092500']);assert.equal(r.delayMinutes,10);
 const y=LIVE_INDICATORS[0];assert.equal(normalizeLiveIndicator(y,{result:{...q.result,reutersCode:y.code,categoryType:'bond',closePrice:'4.902',fluctuations:'-0.0268',delayTime:0}},null,now).bp,-2.68);
});
test('partial failures and regressing source quotes retain the last actual quote and collection timestamp',async()=>{
 const old={schemaVersion:1,collectedAt:now.toISOString(),items:[normalizeLiveIndicator(def,quote,chart,now)]};const next={items:[{id:def.id,code:def.code,status:'unavailable'}]};assert.deepEqual(retainLiveItems(next,old).items[0],{...old.items[0],status:'stale'});
 const regress={items:[{...old.items[0],quoteAt:'2026-11-02T09:00:00-05:00'}]};assert.equal(retainLiveItems(regress,old).items[0].quoteAt,quote.localTradedAt);
 const bad=await collectLiveIndicators(async()=>({ok:false}),now);assert.equal(bad.items.length,12);assert.ok(bad.items.every(i=>i.status==='unavailable'&&i.price===undefined));
});
const optionHTML=(a='3,538',b='-586')=>`<p>(금액 : 백만원)</p><table><tr><th>시장구분</th><th>개인</th><th>외국인</th><th>기관계</th></tr><tr><td>KOSPI200콜옵션</td><td>22</td><td>${a}</td><td>-3,238</td></tr><tr><td>KOSPI200풋옵션</td><td>-673</td><td>${b}</td><td>1,202</td></tr></table>`;
test('options use the verified foreign column and million-to-eok conversion, no invented trade timestamp/positions',()=>{
 const r=parseOptionSnapshot(optionHTML(),now);assert.equal(r.items[0].foreignNet,35.38);assert.equal(r.items[1].foreignNet,-5.86);assert.equal(r.items[0].personalNet,.22);assert.equal(r.tradeAt,null);assert.equal(r.collectedAt,now.toISOString());assert.equal(r.items[0].openInterest,undefined);
 assert.equal(parseOptionSnapshot(optionHTML('0'),now).items[0].foreignNet,0);assert.throws(()=>parseOptionSnapshot(optionHTML(' '),now));assert.throws(()=>parseOptionSnapshot(optionHTML().replace('백만원','계약'),now),/unit/);assert.throws(()=>parseOptionSnapshot(optionHTML().replace('<th>개인</th><th>외국인</th>','<th>외국인</th><th>개인</th>'),now),/column/);
});
test('concurrent cache refreshes are coalesced, keys independent and expiry observed',async()=>{
 let t=0,calls=0,release;const cache=createRequestCache({ttl:20,now:()=>t}),loader=()=>{calls++;return new Promise(r=>release=r);};const a=cache('FUT',loader),b=cache('FUT',loader);assert.equal(calls,1);release({price:1});assert.deepEqual(await a,await b);await cache('FUT',loader);assert.equal(calls,1);await cache('KOSPI',async()=>({price:2}));t=21;await cache('FUT',async()=>{calls++;return{price:3};});assert.equal(calls,2);
});
test('selected-market collection never waits on unrelated markets',async()=>{
 const seen=[];const d=await collectMarket(async u=>{seen.push(u);return{ok:false,status:503};},['FUT']);assert.deepEqual(Object.keys(d.markets),['FUT']);assert.ok(seen.every(u=>u.includes('FUT')));await assert.rejects(collectMarket(fetch,['CALL']),/Invalid/);
});
