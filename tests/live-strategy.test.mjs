import test from 'node:test';import assert from 'node:assert/strict';
import{analyzeStrategy}from'../strategy-core.mjs';import{liveDailyRows}from'../live-chart-core.mjs';import{aggregateFourHours}from'../reversal-core.mjs';
const row=(i,c,extra={})=>({asOf:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:c-.2,high:c+.4,low:c-.4,close:c,volume:100,...extra});
const history=()=>Array.from({length:70},(_,i)=>row(i,100+i*.2));
test('entry allows low volume; goals fixed at 2R/3R, no entry-bar target lookahead',()=>{
 const a=history();a.push(row(70,120,{volume:50,high:200}));const g=analyzeStrategy(a),t=g.frames.at(-1).trade;assert.ok(t);assert.equal(t.entry,120);assert.equal(t.tp1,120+2*t.risk);assert.equal(t.tp2,120+3*t.risk);assert.ok(g.frames.at(-1).signals.includes('breakoutEntry'));assert.ok(!g.frames.at(-1).signals.includes('tp1'));
 a.push(row(71,t.tp2+1));const next=analyzeStrategy(a);assert.ok(next.frames.at(-1).signals.includes('tp1'));assert.ok(next.frames.at(-1).signals.includes('tp2'));assert.equal(next.frames.at(-1).trade.tp1,t.tp1);
});
test('future bars do not modify old signals; revised live bar can retract provisional entry',()=>{
 const h=history(),pending=row(70,120,{volume:50,provisional:true}),first=analyzeStrategy([...h,pending]);assert.ok(first.events.at(-1).provisional);
 const future=analyzeStrategy([...h,pending,row(71,130)]);assert.deepEqual(future.frames.slice(0,71),first.frames);
 const changed=analyzeStrategy([...h,row(70,110,{provisional:true})]);assert.ok(!changed.frames.at(-1).signals.includes('breakoutEntry'));assert.equal(changed.frames.at(-1).trade,null);
});
test('PEG anchor stays fixed, invalidates at close, expiry after 20 bars',()=>{
 const h=Array.from({length:70},(_,i)=>row(i,100));h.push(row(70,110,{open:105,low:104,high:112,volume:300}));let g=analyzeStrategy(h);assert.equal(g.frames.at(-1).peg.base,100.4);assert.ok(g.frames.at(-1).signals.includes('peg'));
 const below=[...h,row(71,100,{low:99,high:110})];assert.ok(analyzeStrategy(below).frames.at(-1).signals.includes('pegInvalid'));
 const expired=[...h,...Array.from({length:20},(_,i)=>row(71+i,108))];g=analyzeStrategy(expired);assert.ok(g.frames.at(-1).signals.includes('pegExpired'));assert.equal(g.frames.at(-1).peg,null);
});
test('same candle target touch and close exit are not treated as ordered fills',()=>{
 const h=[...history(),row(70,120)];const t=analyzeStrategy(h).frames.at(-1).trade;
 h.push(row(71,t.stop-1,{high:t.tp2+1,low:t.stop-2,open:120}));const g=analyzeStrategy(h);assert.ok(g.frames.at(-1).signals.includes('tp2'));assert.ok(g.frames.at(-1).signals.includes('exit'));assert.equal(g.frames.at(-1).trade,null);
});
test('live daily updates same-day regular quote, keeps volume, rejects after-hours and cross-day quotes',()=>{
 const own={market:'KR',timezone:'Asia/Seoul',collectedAt:'2026-11-11T02:01:00Z',bars:[{date:'2026-11-11',open:100,high:102,low:99,close:101,volume:20}],quote:{status:'ok',price:104,asOf:'2026-11-11T11:00:00+09:00'}};
 const rows=liveDailyRows(own,new Date('2026-11-11T02:02:00Z'));assert.equal(rows[0].close,104);assert.equal(rows[0].high,104);assert.equal(rows[0].volume,20);assert.equal(rows[0].provisional,true);
 own.quote.asOf='2026-11-11T17:00:00+09:00';assert.equal(liveDailyRows(own,new Date('2026-11-11T08:00:00Z'))[0].close,101);
 own.quote.asOf='2026-11-12T10:00:00+09:00';assert.equal(liveDailyRows(own,new Date('2026-11-11T08:00:00Z')).length,1);assert.equal(liveDailyRows(own)[0].close,101);
});
test('4h retains live OHLCV with no missing-slot fabrication; closes at session boundary',()=>{
 const start=Date.parse('2026-11-11T00:00:00Z')/1000,end=start+21600,ts=Array.from({length:12},(_,i)=>start+i*1800),q={open:ts.map(()=>100),high:ts.map(()=>102),low:ts.map(()=>99),close:ts.map(()=>101),volume:ts.map(()=>10)},meta={symbol:'005930.KS',currency:'KRW',exchangeTimezoneName:'Asia/Seoul',dataGranularity:'30m',regularMarketTime:start+5400,tradingPeriods:[[{start,end}]]},raw={chart:{result:[{meta,timestamp:ts,indicators:{quote:[q]}}]}};
 const id={symbol:'005930.KS',market:'KR',currency:'KRW',timezone:'Asia/Seoul'},now=new Date((start+5400)*1000);let g=aggregateFourHours(raw,id,now,true);assert.equal(g.bars.length,1);assert.equal(g.bars[0].volume,40);assert.equal(g.bars[0].provisional,true);assert.equal(aggregateFourHours(raw,id,now).bars.length,0);
 meta.regularMarketTime=end;g=aggregateFourHours(raw,id,new Date(end*1000),true);assert.equal(g.bars.length,2);assert.ok(g.bars.every(p=>!p.provisional));assert.equal(g.bars[1].durationMinutes,120);
 q.close[9]=null;g=aggregateFourHours(raw,id,new Date(end*1000),true);assert.equal(g.bars.length,0,'gap clears contiguous history');
});
