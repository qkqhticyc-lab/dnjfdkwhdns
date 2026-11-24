import test from 'node:test';import assert from 'node:assert/strict';
import {SECTOR_ETFS,sectorETFQuote,collectSectorSummary,normalizeSectorStock,collectSectorStocks,retainSectorSummary,sectorRectangles,currentSectorStocks} from '../live-sector-core.mjs';
const now=new Date('2026-11-24T15:00:00Z');
const quote=(symbol,extra={})=>({reutersCode:symbol,stockEndType:'etf',currencyType:{code:'USD'},closePriceRaw:'100',fluctuationsRatioRaw:'-2',accumulatedTradingValueRaw:'123456789',localTradedAt:'2026-11-24T09:59:00-05:00',marketStatus:'OPEN',delayTime:0,...extra});
test('sector ETF identities, raw dollars and actual source timestamps are validated, including XLRE provider identity',()=>{
 const q=sectorETFQuote('technology','XLK',quote('XLK'),now);assert.equal(q.turnover,123456789);assert.equal(q.changePercent,-2);assert.equal(q.quoteAt,'2026-11-24T14:59:00.000Z');assert.equal(q.sessionDate,'2026-11-24');
 assert.equal(sectorETFQuote('realestate','XLRE',quote('XLRE.K'),now).symbol,'XLRE');
 for(const extra of [{reutersCode:'SPY'},{stockEndType:'stock'},{currencyType:{code:'KRW'}},{localTradedAt:'2026-11-25T10:00:00-05:00'}])assert.throws(()=>sectorETFQuote('technology','XLK',quote('XLK',extra),now));
});
test('live US summary fetches 11 independent sector ETFs and benchmark, marks older sessions rather than mixing them',async()=>{
 const urls=[],fetcher=async u=>{urls.push(u);const symbol=u.split('/').at(-2);return Response.json(quote(symbol,symbol==='XLE'?{localTradedAt:'2026-11-23T16:00:00-05:00'}:{}));};
 const d=await collectSectorSummary('US',fetcher,now);assert.equal(d.sectors.length,11);assert.equal(urls.length,12);assert.ok(urls.some(u=>u.includes('XLRE.K')));assert.equal(d.benchmark.symbol,'SPY');assert.equal(d.marketStatus,'OPEN');assert.equal(d.sectors.find(p=>p.symbol==='XLE').status,'stale');assert.equal(d.sessionDate,'2026-11-24');
 await assert.rejects(collectSectorSummary('US',async()=>new Response('',{status:503}),now));
});
test('Korean broad groups use provided current industry changes with explicit count weighting',async()=>{
 const fetcher=async u=>Response.json(u.includes('/industry?')?{totalCount:3,groups:[{no:278,name:'반도체',totalCount:2,changeRate:'3'},{no:267,name:'장비',totalCount:1,changeRate:'-3'},{no:270,name:'자동차부품',totalCount:4,changeRate:'2'}]}:{reutersCode:'KOSPI',localTradedAt:'2026-11-24T15:30:00+09:00',marketStatus:'CLOSE',fluctuationsRatio:'1.5'});
 const d=await collectSectorSummary('KR',fetcher,now),tech=d.sectors.find(p=>p.id==='technology');assert.equal(tech.changePercent,1);assert.equal(tech.count,3);assert.equal(tech.groups.length,2);assert.equal(d.marketStatus,'CLOSE');assert.equal(d.sizeBasis,'count');assert.equal(d.sessionDate,'2026-11-24');
});
const stock=(symbol,extra={})=>({stockEndType:'stock',symbolCode:symbol,reutersCode:symbol+'.O',stockName:symbol,currencyType:{code:'USD'},industryCodeType:{code:'57106020',industryGroupKor:'기술'},closePriceRaw:'101.25',fluctuationsRatioRaw:'1.5',accumulatedTradingValueRaw:'1000000000',localTradedAt:'2026-11-24T09:59:00-05:00',marketStatus:'OPEN',stockExchangeType:{name:'NASDAQ'},...extra});
test('live stock values preserve currency units and reject ETFs, future quotes and malformed identities',()=>{
 const p=normalizeSectorStock(stock('AAPL'),'US',{id:'technology',industry:'장치'},now);assert.equal(p.turnover,1e9);assert.equal(p.price,101.25);assert.equal(p.sessionDate,'2026-11-24');
 for(const q of [stock('AAPL',{isEtf:true}),stock('AAPL',{stockEndType:'etf'}),stock('<bad>'),stock('AAPL',{localTradedAt:'2026-11-25T10:00:00-05:00'})])assert.equal(normalizeSectorStock(q,'US',{id:'technology'},now),null);
});
test('stock drilldown pages all US exchanges, removes duplicate identities and discloses partial source failures',async()=>{
 const seen=[];let fail=false;const fetcher=async url=>{const u=new URL(url),page=+u.searchParams.get('page');seen.push(url);if(page===2&&fail)return new Response('',{status:503});return Response.json({page,totalCount:101,stocks:page===1?[stock('AAPL')]:[stock('AAPL'),stock('NVDA')]});};
 const d=await collectSectorStocks('US','technology',fetcher,now);assert.equal(seen.length,6);assert.equal(d.items.length,2);assert.equal(d.partial,false);assert.equal(d.items.find(p=>p.symbol==='NVDA').turnover,1e9);
 fail=true;const partial=await collectSectorStocks('US','technology',fetcher,now);assert.equal(partial.partial,true);assert.equal(partial.items.length,1);
});
test('treemap area is proportional to verified weights, bounded and non-overlapping; stale quote retention preserves time',()=>{
 const rows=[{id:'a',weight:10},{id:'b',weight:5},{id:'c',weight:1},{id:'bad',weight:NaN}],rects=sectorRectangles(rows);
 assert.equal(rects.length,3);assert.ok(Math.abs(rects.reduce((s,r)=>s+r.w*r.h,0)-500000)<1e-6);
 for(const r of rects){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=1000.000001&&r.y+r.h<=500.000001);assert.ok(Math.abs(r.w*r.h/500000-r.weight/16)<1e-9);}
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y))<1e-6);}
 const old={market:'US',sectors:[{id:'technology',status:'ok',quoteAt:'2026-11-24T14:59:00Z',changePercent:2}]},next={market:'US',sectors:[{id:'technology',status:'unavailable'}]};assert.deepEqual(retainSectorSummary(next,old).sectors[0],{...old.sectors[0],status:'stale'});
});
test('current-session drilldown excludes old halted quotes instead of ranking historical falls as today moves',()=>{
 const items=[{symbol:'AAPL',sector:'technology',sessionDate:'2026-11-24'},{symbol:'OLD',sector:'technology',sessionDate:'2026-09-16'},{symbol:'PFE',sector:'healthcare',sessionDate:'2026-11-24'}];
 const d=currentSectorStocks(items,'technology','2026-11-24');assert.deepEqual(d.items.map(p=>p.symbol),['AAPL']);assert.equal(d.excludedOlderCount,1);
});
