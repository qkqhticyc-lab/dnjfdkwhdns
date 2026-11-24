import test from 'node:test';import assert from 'node:assert/strict';
import{LIVE_INDICATORS,normalizeLiveIndicator,retainLiveItems,collectLiveIndicators,indicatorChartLag,normalizeNasdaqIndicator,normalizeCNBCIndicator}from'../live-indicators-core.mjs';
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

test('a refreshed quote timestamp cannot conceal a stalled US chart; secondary quotes use actual trade time and previous close',()=>{
 const item={id:'nasdaq',marketStatus:'OPEN',quoteAt:'2026-11-24T09:40:00-05:00',points:[]};assert.equal(indicatorChartLag(item),true);
 assert.equal(indicatorChartLag({...item,quoteAt:'2026-11-24T09:30:30-05:00'}),true);
 assert.equal(indicatorChartLag({...item,points:[{at:'20261124093000'}]}),true);
 assert.equal(indicatorChartLag({...item,points:[{at:'20261124093900'}]}),false);

});

test('Nasdaq official feed uses documented Eastern wall-clock times rather than its inconsistent chart x values',()=>{
 const d=LIVE_INDICATORS.find(p=>p.id==='nasdaq'),payload={data:{symbol:'COMP',timeAsOf:'Nov 24, 2026 9:42 AM ET',lastSalePrice:'23,700.00',previousClose:'24,000.00',chart:[{x:1,y:23710,z:{dateTime:'9:41 AM ET'}},{x:2,y:23700,z:{dateTime:'9:42 AM ET'}},{x:3,y:23690,z:{dateTime:'9:43 AM ET'}}]}};
 const r=normalizeNasdaqIndicator(d,payload,new Date('2026-11-24T14:43Z'));assert.equal(r.quoteAt,'2026-11-24T14:42:00.000Z');assert.equal(r.points.length,2);assert.equal(r.points.at(-1).at,'20261124094200');assert.ok(Math.abs(r.changePercent+1.25)<1e-10);assert.equal(r.delayLabel,'최소 1분 지연');
 assert.equal(normalizeNasdaqIndicator(d,{data:{...payload.data,timeAsOf:'Jul 20, 2026 9:42 AM ET'}},new Date('2026-07-20T13:43Z')).quoteAt,'2026-07-20T13:42:00.000Z');
 assert.throws(()=>normalizeNasdaqIndicator(d,{data:{...payload.data,symbol:'SPX'}}));
});

test('CNBC quotes retain source timestamp and identity; sampled history merges observed prices and resets each session',()=>{
 const d=LIVE_INDICATORS.find(p=>p.id==='sp500'),q={symbol:'.SPX',type:'INDEX',currencyCode:'USD',last:'7,150.00',previous_day_closing:'7,200.00',last_time:'2026-11-24T09:45:14.000-0500',curmktstatus:'REG_MKT'};
 const r=normalizeCNBCIndicator(d,'<script>window.__s_data='+JSON.stringify({quote:{data:[q]}})+';window.other="{}";</script>',new Date('2026-11-24T14:46Z'));
 assert.equal(r.quoteAt,'2026-11-24T14:45:14.000Z');assert.equal(r.points[0].at,'20261124094514');assert.equal(r.price,7150);assert.equal(r.chartSampled,true);
 const old={...r,points:[{at:'20261124094400',price:7140}]},merged=retainLiveItems({items:[r]},{items:[old]}).items[0];assert.equal(merged.points.length,2);assert.equal(merged.points[0].price,7140);
 assert.equal(retainLiveItems({items:[r]},{items:[{...old,chartDate:'20261123'}]}).items[0].points.length,1);
 assert.throws(()=>normalizeCNBCIndicator(d,'window.__s_data='+JSON.stringify({quote:{data:[{...q,symbol:'.IXIC'}]}})));
});

test('stalled or empty Naver intraday feeds switch to independent quotes even if the first alternate fails',async()=>{
 const time=new Date('2026-11-24T14:40Z');let cnbc=0;
 const fetcher=async url=>{
  const id=String(url).includes('.INX')?'sp500':String(url).includes('.IXIC')?'nasdaq':null,code=id==='sp500'?'.INX':'.IXIC',price=id==='sp500'?7200:24000;
  if(id&&url.includes('/basic'))return Response.json({reutersCode:code,stockEndType:'index',closePrice:String(price),compareToPreviousClosePrice:'0',fluctuationsRatio:'0',localTradedAt:'2026-11-24T09:40:00-05:00',marketStatus:'OPEN',delayTime:0});
  if(id&&url.includes('scriptChartType'))return Response.json({code,infoType:'index',periodType:'day',tradeBaseAt:'20261124',localDateTimeNow:'20261124094000',zoneId:'EST5EDT',priceInfos:id==='sp500'?[{localDateTime:'20261124093000',currentPrice:price}]:[]});
  if(url.includes('api.nasdaq.com'))throw Error('Network unavailable');
  if(url.includes('www.cnbc.com')){cnbc++;const symbol=url.endsWith('.SPX')?'.SPX':url.endsWith('.IXIC')?'.IXIC':'.DJI',last=symbol==='.SPX'?7100:23700,previous=symbol==='.SPX'?7200:24000;return new Response('window.__s_data='+JSON.stringify({quote:{data:[{symbol,type:'INDEX',currencyCode:'USD',last,previous_day_closing:previous,last_time:'2026-11-24T09:39:00.000-0500',curmktstatus:'REG_MKT'}]}})+';');}
  return new Response('',{status:503});
 };
 const r=await collectLiveIndicators(fetcher,time);
 for(const id of ['sp500','nasdaq']){const q=r.items.find(p=>p.id===id);assert.equal(q.provider,'CNBC');assert.equal(q.status,'ok');assert.equal(q.quoteAt,'2026-11-24T14:39:00.000Z');assert.ok(q.changePercent<0);assert.equal(q.points.at(-1).at,'20261124093900');}assert.ok(cnbc>=2);
});
