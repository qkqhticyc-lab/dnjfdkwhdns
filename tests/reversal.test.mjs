import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReversal,aggregateFourHours,collectReversals} from '../reversal-core.mjs';
const rows=a=>a.map((close,i)=>({asOf:new Date(Date.UTC(2025,0,1+i)).toISOString(),close,volume:100}));
const recovery=[...Array.from({length:130},(_,i)=>300-i),...Array.from({length:100},(_,i)=>170+i*2)];
test('recovery progresses from attempt to two-bar confirmation and then maintenance',()=>{
 assert.equal(analyzeReversal(rows(recovery.slice(0,140))).state,'up_attempt');
 assert.equal(analyzeReversal(rows(recovery.slice(0,154))).confirmation,1);
 const confirmed=analyzeReversal(rows(recovery.slice(0,155)));assert.equal(confirmed.state,'up_reversal');assert.equal(confirmed.confirmation,2);assert.equal(confirmed.lastSignal.asOf,rows(recovery)[154].asOf);
 assert.equal(analyzeReversal(rows(recovery.slice(0,160))).state,'up_trend');
 const falling=recovery.map(v=>600-v);assert.equal(analyzeReversal(rows(falling.slice(0,140))).state,'down_attempt');assert.equal(analyzeReversal(rows(falling.slice(0,155))).state,'down_reversal');
});
test('insufficient, flat and already established trends do not fabricate a reversal',()=>{
 assert.equal(analyzeReversal(rows(recovery.slice(0,64))).status,'insufficient');
 const flat=analyzeReversal(rows(Array(100).fill(100)));assert.equal(flat.state,'mixed');assert.equal(flat.lastSignal,null);assert.ok(flat.conditions.every(p=>!p.met&&!p.downMet||p.label.includes('RSI')));
 const trend=analyzeReversal(rows(Array.from({length:100},(_,i)=>100+i)));assert.equal(trend.state,'up_trend');assert.equal(trend.lastSignal,null);
 assert.throws(()=>analyzeReversal([{asOf:'x',close:2},{asOf:'x',close:3}]));
});
test('four-hour volume compares the same window and duration, without treating missing volume as zero',()=>{
 const a=rows(Array.from({length:90},(_,i)=>100+i)).map((r,i)=>({...r,durationMinutes:i%2?120:240,bucket:i%2,volume:i%2?100:1000}));a.at(-1).volume=200;
 assert.equal(analyzeReversal(a).volumeRatio,2);a.at(-1).volume=null;assert.equal(analyzeReversal(a).volumeRatio,null);a.at(-1).volume=0;assert.equal(analyzeReversal(a).volumeRatio,0);
});
const identity={symbol:'TEST',market:'US',currency:'USD',timezone:'America/New_York'};
function fixture(sessions,{skip=[],now,market='US',timezone='America/New_York'}={}){
 const timestamp=[];for(const s of sessions)for(let t=s.start;t<s.end;t+=1800){const hm=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).format(t*1000);if(skip.includes(t)||(market==='HK'&&hm>='12:00'&&hm<'13:00')||(market==='JP'&&hm>='11:30'&&hm<'12:30'))continue;timestamp.push(t);}
 const values=timestamp.map((_,i)=>100+i);return{chart:{result:[{meta:{symbol:'TEST',currency:identity.currency,exchangeTimezoneName:timezone,dataGranularity:'30m',regularMarketTime:now??sessions.at(-1).end,tradingPeriods:sessions.map(s=>[s])},timestamp,indicators:{quote:[{open:values,high:values.map(v=>v+1),low:values.map(v=>v-1),close:values,volume:values.map(()=>10)}]}}],error:null}};
}
const sec=s=>Date.parse(s)/1000,session=(start,hours)=>({start:sec(start),end:sec(start)+hours*3600});
test('session-anchored aggregation respects DST, shortened closes and excludes unconfirmed buckets',()=>{
 const sessions=[session('2026-10-30T13:30:00Z',6.5),session('2026-11-02T14:30:00Z',6.5)],p=fixture(sessions),a=aggregateFourHours(p,identity,new Date('2026-11-03'));
 assert.equal(a.bars.length,4);assert.equal(a.bars[0].durationMinutes,240);assert.equal(a.bars[1].durationMinutes,150);assert.equal(a.bars[2].start,'2026-11-02T14:30:00.000Z');assert.equal(a.bars[2].volume,80);
 const forming=fixture(sessions,{now:sessions[1].start+5*3600}),b=aggregateFourHours(forming,identity,new Date('2026-11-03'));assert.equal(b.bars.length,3);assert.equal(b.inProgress,1);
 const half=aggregateFourHours(fixture([session('2026-11-27T14:30:00Z',3.5)]),identity,new Date('2026-11-28'));assert.equal(half.bars.length,1);assert.equal(half.bars[0].durationMinutes,210);
});
test('missing half-hour data breaks continuity; lunch breaks do not create missing bars',()=>{
 const sessions=[session('2026-11-02T14:30:00Z',6.5),session('2026-11-03T14:30:00Z',6.5)],a=aggregateFourHours(fixture(sessions,{skip:[sessions[1].start]}),identity,new Date('2026-11-04'));assert.equal(a.incomplete,1);assert.equal(a.bars.length,1);assert.equal(a.validBars,3);
 for(const [market,timezone,start,hours]of[['HK','Asia/Hong_Kong','2026-11-03T01:30:00Z',6.5],['JP','Asia/Tokyo','2026-11-03T00:00:00Z',6.5]]){const p=fixture([session(start,hours)],{market,timezone}),b=aggregateFourHours(p,{...identity,market,timezone},new Date('2026-11-04'));assert.equal(b.incomplete,0);assert.equal(b.bars.length,2);}
});
test('wrong source identity and interval are rejected, invalid OHLC is excluded',()=>{
 const s=[session('2026-11-02T14:30:00Z',6.5)];for(const [k,v]of[['symbol','OTHER'],['currency','EUR'],['dataGranularity','1d'],['exchangeTimezoneName','UTC']]){const p=fixture(s);p.chart.result[0].meta[k]=v;assert.throws(()=>aggregateFourHours(p,identity,new Date('2026-11-03')));}
 const p=fixture(s);p.chart.result[0].indicators.quote[0].high[0]=1;assert.equal(aggregateFourHours(p,identity,new Date('2026-11-03')).incomplete,1);
});
test('today is excluded from daily analysis and intraday failure leaves daily analysis intact',async()=>{
 const daily=rows(Array.from({length:100},(_,i)=>100+i)).map(r=>({...r,date:r.asOf.slice(0,10)}));const now=new Date(daily.at(-1).asOf),own={market:'US',symbol:'TEST',currency:'USD',timezone:'America/New_York',source:'https://example.com',bars:daily};
 now.setUTCHours(22);const result=await collectReversals(own,async()=>{throw Error('offline');},now);assert.equal(result.daily.status,'ok');assert.equal(result.daily.observations,99);assert.equal(result.daily.asOf,daily.at(-2).date);assert.equal(result.fourHour.status,'unavailable');
});
