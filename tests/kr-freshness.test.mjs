import test from 'node:test';
import assert from 'node:assert/strict';
import {flowHeadline,flowWindow} from '../flow-view-core.mjs';
import {LIVE_INDICATORS,normalizeLiveIndicator} from '../live-indicators-core.mjs';
test('latest quote drives headline independently of a slower minute chart, with delay disclosed',()=>{
 const m={date:'2026-11-09',price:775.85,changePercent:-.79,priceTime:'2026-11-09T15:34:59+09:00',delayMinutes:20,previousClose:782,prices:[{time:'15:34',price:774.45}],points:[{time:'16:06',foreignNet:8306.38}]};
 assert.deepEqual(flowHeadline(m),{price:775.85,percent:-.79,time:'15:34:59',source:'quote',delayLabel:'제공처 20분 지연'});
 assert.deepEqual(flowWindow(m).prices,m.prices,'never fabricate a quote-time candle or after-hours extension');
 assert.equal(flowHeadline({...m,priceTime:'2026-11-06T15:34:59+09:00'}).source,'chart');
 assert.equal(flowHeadline({...m,priceTime:'2026-11-09T15:33:59+09:00'}).price,774.45);
 assert.equal(flowHeadline({...m,delayMinutes:0}).delayLabel,'제공처 실시간');
 assert.equal(flowHeadline({...m,delayMinutes:null}).delayLabel,'제공처 지연 여부 미제공');
});
test('domestic closing updates after nominal close are retained without accepting tomorrow or future data',()=>{
 const def=LIVE_INDICATORS.find(d=>d.id==='kospi'),q={reutersCode:'KOSPI',stockEndType:'index',closePrice:'5018.85',localTradedAt:'2026-11-09T20:15:00+09:00',delayTime:0},c={code:'KOSPI',infoType:'index',periodType:'day',tradeBaseAt:'20261109',openTime:'20261109090000',closeTime:'20261109153000',priceInfos:[{localDateTime:'20261109153000',currentPrice:5019.78},{localDateTime:'20261109153200',currentPrice:5018.85},{localDateTime:'20261110090000',currentPrice:9999}]};
 const r=normalizeLiveIndicator(def,q,c,new Date('2026-11-09T12:00:00Z'));assert.equal(r.points.length,2);assert.equal(r.points.at(-1).price,5018.85);
 const during=normalizeLiveIndicator(def,{...q,localTradedAt:'2026-11-09T15:30:01+09:00'},c,new Date('2026-11-09T12:00:00Z'));assert.equal(during.points.length,1);
});
