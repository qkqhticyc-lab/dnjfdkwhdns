import test from 'node:test';import assert from 'node:assert/strict';
import {INDICATORS,normalizeHistory,indicatorFromHistory,chartSymbols,collectStockChart,collectIndicators} from '../quotes-core.mjs';
const history=(symbol,close=[4.7,4.9,5,4.94])=>({chart:{result:[{meta:{symbol,exchangeTimezoneName:'America/New_York'},timestamp:['20260730','20260930','20261029','20261030'].map(d=>Date.parse(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)+'T15:00:00Z')/1000),indicators:{quote:[{open:[...close],high:[...close],low:[...close],close:[...close],volume:[null,0,100,200]}]}}]}});
test('requested twelve indicators retain exact order, yield percent/bp and commodity units',()=>{
 assert.deepEqual(INDICATORS.map(i=>i.id),['us10y','kospi','kosdaq','nasdaq','dow','sp500','vix','wti','brent','gold','silver','copper']);const h=normalizeHistory(history('^TNX'),'^TNX'),i=indicatorFromHistory(INDICATORS[0],h);assert.equal(i.price,4.94);assert.ok(Math.abs(i.bp+6)<1e-10);assert.ok(Math.abs(i.changePercent+1.2)<1e-10);assert.equal(i.unit,'%');assert.equal(i.periods[1].label,'1개월');assert.equal(INDICATORS.at(-1).unit,'USD/파운드');
});
test('history identity, local date, absent OHLC/volume, and valid zero volume are distinct',()=>{
 const raw=history('AAPL',[100,102,103,101]);raw.chart.result[0].indicators.quote[0].high[2]=null;const h=normalizeHistory(raw,'AAPL');assert.equal(h.bars[0].date,'2026-07-30');assert.equal(h.bars[0].volume,null);assert.equal(h.bars[1].volume,0);assert.equal(h.bars[2].open,null);assert.equal(h.bars[2].close,103);assert.throws(()=>normalizeHistory(raw,'MSFT'),/identity/);
});
test('chart inputs preserve leading zeros and separate Korean exchanges and share classes',()=>{
 assert.deepEqual(chartSymbols('KR','005930','코스피'),['005930.KS']);assert.deepEqual(chartSymbols('KR','247540','코스닥'),['247540.KQ']);assert.deepEqual(chartSymbols('US','BRK.B'),['BRK-B']);assert.deepEqual(chartSymbols('HK','00700'),['0700.HK']);assert.deepEqual(chartSymbols('JP','164A'),['164A.T']);assert.throws(()=>chartSymbols('US','../../secret'));
});
test('Naver chart uses exact country/code identity, actual daily OHLCV and correct HK counter currency',async()=>{
 const fetcher=async url=>({ok:true,json:async()=>url.includes('autocomplete')?{result:{items:[{category:'stock',nationCode:'HKG',code:'80700',reutersCode:'80700.HK',name:'텐센트 (CNY)',typeName:'홍콩 거래소'}]}}:[{localDate:'20261029',openPrice:340,highPrice:360,lowPrice:330,closePrice:350,accumulatedTradingVolume:0},{localDate:'20261030',openPrice:350,highPrice:355,lowPrice:335,closePrice:340,accumulatedTradingVolume:1200}]});
 const d=await collectStockChart({market:'HK',symbol:'80700',currency:'CNY'},fetcher);assert.equal(d.currency,'CNY');assert.equal(d.providerSymbol,'80700.HK');assert.equal(d.bars[0].date,'2026-10-29');assert.equal(d.bars[0].volume,0);assert.equal(d.bars[1].volume,1200);assert.equal(d.bars[1].open,350);await assert.rejects(collectStockChart({market:'HK',symbol:'80700',currency:'HKD'},fetcher),/Currency/);await assert.rejects(collectStockChart({market:'US',symbol:'80700'},fetcher),/Invalid/);
});
test('an unavailable source yields missing cards, never zero quotes',async()=>{const d=await collectIndicators(async()=>({ok:false,status:503}));assert.equal(d.items.length,12);assert.ok(d.items.every(i=>i.status==='unavailable'&&i.price===undefined));});
