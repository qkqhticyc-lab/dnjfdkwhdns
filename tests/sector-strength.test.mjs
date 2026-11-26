import test from 'node:test';
import assert from 'node:assert/strict';
import {sectorStrengthInputs,sectorBenchmark,sectorStrength} from '../sector-strength-core.mjs';
import {loungeStocks} from '../lounge-core.mjs';
import {screenRow} from '../screener-core.mjs';
import {normalizeSectorBenchmark,validSectorBenchmarks} from '../sector-benchmark-core.mjs';

const asOf='2026-11-25',from={5:'2026-11-18',20:'2026-10-28',60:'2026-08-31'};
const inputs=(values=[3,8,15],above20=true)=>({version:1,asOf,above20,windows:Object.fromEntries([5,20,60].map((h,i)=>[h,{from:from[h],return:values[i]}]))});
const benchmark=inputs([1,2,4]);
function fixture(n=6,values=[3,8,15]){
 const rows=Array.from({length:n},(_,i)=>({market:'US',symbol:'TEST'+i,name:'Test',status:'ok',asOf,sectorStrength:inputs(values),rsi:60,liquidity:{average:1e8,median:1e8,activeDays:20,last:1.5e8},signal:i===0?{status:'active',age:2,entryType:'breakout'}:null}));
 return{rows,classifications:new Map(rows.map(p=>['US:'+p.symbol,{id:'technology'}]))};
}
test('stock metrics use trading observations and missing long histories stay unavailable',()=>{
 const rows=Array.from({length:61},(_,i)=>({asOf:String(i),close:100+i}));
 const result=sectorStrengthInputs(rows);
 assert.equal(result.windows[5].from,'55');assert.equal(result.windows[5].return,(160/155-1)*100);assert.equal(result.windows[60].return,60.00000000000001);assert.equal(result.above20,true);
 assert.equal(sectorStrengthInputs(rows.slice(0,20)).windows[20],null);
 assert.equal(sectorStrengthInputs([]),null);
});
test('outliers cannot manufacture sector leadership; breadth and recent signals use the entire eligible sector',()=>{
 const {rows,classifications}=fixture();rows[5].sectorStrength=inputs([1000,1000,1000]);
 const result=sectorStrength(rows,classifications,benchmark),g=result.leaders[0];
 assert.equal(g.state,'leader');assert.equal(g.returns[20],8);assert.equal(g.relative[20],6);assert.equal(g.count,6);assert.equal(g.recentSignals,1);assert.equal(g.turnoverRatio,1.5);
 rows.slice(0,4).forEach(p=>p.sectorStrength.above20=false);
 assert.equal(sectorStrength(rows,classifications,benchmark).leaders.length,0);
});
test('falling defensive sectors and early improvements are not labelled leaders',()=>{
 const {rows,classifications}=fixture(5,[-1,-3,-4]);
 let g=sectorStrength(rows,classifications,inputs([-2,-8,-10])).leaders[0];assert.equal(g.state,'defensive');
 rows.forEach(p=>p.sectorStrength=inputs([2,-3,-4]));
 g=sectorStrength(rows,classifications,benchmark).leaders[0];assert.equal(g.state,'improving');
});
test('small samples, old scans, mismatched windows and missing benchmarks do not produce rankings',()=>{
 const {rows,classifications}=fixture();
 assert.equal(sectorStrength(rows.slice(0,4),classifications,benchmark).leaders.length,0);
 rows[0].asOf='2026-11-24';rows[1].sectorStrength.version=0;rows[2].sectorStrength.windows[20].from='2026-10-27';rows[3].status='stale';
 const result=sectorStrength(rows,classifications,benchmark);assert.equal(result.measured,2);assert.equal(result.leaders.length,0);
 assert.equal(sectorStrength(rows,classifications,null).measured,0);
});
test('market benchmark excludes unfinished bars and requires exactly the same close date',()=>{
 const points=Array.from({length:70},(_,i)=>({date:new Date(Date.UTC(2026,8,18+i)).toISOString().slice(0,10),close:100+i}));points.at(-1).close=1;
 const last=points.at(-1).date,previous=points.at(-2).date;
 assert.equal(sectorBenchmark({points},'US',last,new Date(last+'T15:00:00Z')),null);
 const b=sectorBenchmark({points},'US',previous,new Date(last+'T15:00:00Z'));assert.equal(b.asOf,previous);assert.ok(b.windows[20].return>0);
});
test('entry-type filters never select the denominator for sector strength; overheated groups carry a separate flag',()=>{
 const {rows,classifications}=fixture(6,[12,20,30]);rows.forEach(p=>p.rsi=75);
 const a=loungeStocks(rows,'US','pullback'),b=loungeStocks(rows,'US','all');assert.equal(a.rows.length,b.rows.length);
 assert.equal(sectorStrength(a.rows,classifications,benchmark).leaders[0].heat,true);
});
test('scanner exports strength metrics from closed rows only',()=>{
 const bars=Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10),open:100+i,high:102+i,low:99+i,close:101+i,volume:1e6}));
 const now=new Date(bars.at(-1).date+'T01:00:00Z'),result=screenRow({market:'KR',symbol:'005930'},bars,now);
 assert.equal(result.sectorStrength.asOf,bars.at(-2).date);assert.equal(result.sectorStrength.windows[20].from,bars.at(-22).date);
});
test('dedicated benchmark history excludes unfinished closes and validates full two-market snapshots',()=>{
 const raw=Array.from({length:75},(_,i)=>({localDate:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10).replaceAll('-',''),closePrice:100+i}));
 const date=raw.at(-1).localDate.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),now=new Date(date+'T01:00:00Z');
 const kr=normalizeSectorBenchmark(raw,'KR',now),us=normalizeSectorBenchmark(raw,'US',now);
 assert.notEqual(kr.asOf,date);assert.equal(kr.points.length,74);
 assert.equal(validSectorBenchmarks({schemaVersion:1,items:[kr,us]}),true);
 assert.equal(validSectorBenchmarks({schemaVersion:1,items:[kr,kr]}),false);
 assert.throws(()=>normalizeSectorBenchmark([...raw,raw[0]],'KR',now),/Duplicate/);
 assert.throws(()=>normalizeSectorBenchmark(raw.slice(0,20),'KR',now),/Insufficient/);
});
