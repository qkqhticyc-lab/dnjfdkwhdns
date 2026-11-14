import test from'node:test';import assert from'node:assert/strict';
import{reboundCandidate}from'../rebound-candidate-core.mjs';
import{analyzeStrategy}from'../strategy-core.mjs';
import{screenRow,filterScreen,mergeScreenShards}from'../screener-core.mjs';
const date=i=>new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10);
const row=(i,c,extra={})=>({asOf:date(i),open:c-.2,close:c,high:c+.5,low:c-.5,volume:100,...extra});
const history=()=>[...Array.from({length:205},(_,i)=>row(i,100+(i%2?2:-2))),row(205,66,{open:68,high:69,low:65.5,volume:200})];
const daily=a=>a.map(p=>({...p,date:p.asOf}));
const item={market:'US',symbol:'TEST',providerSymbol:'TEST.O',name:'Test',currency:'USD'};
test('natural watch becomes a separate candidate before any rebound entry; confirmed and expired watches leave results',()=>{
 const a=history(),g=analyzeStrategy(a),c=reboundCandidate(g.frames);assert.ok(c);assert.equal(c.age,0);assert.equal(c.newLow,true);assert.equal(c.lower,65.5);assert.equal(c.referencePrice,66);assert.equal(c.currentDropPct,(1-66/102.5)*100);assert.ok(c.blocked.length>0);assert.equal(c.asOf,date(205));assert.equal(c.expiresIn,10);
 assert.ok(!('entry'in c)&&!('tp1'in c)&&!('tp2'in c)&&!('stop'in c));assert.equal(g.frames.at(-1).bounce.signal,false);
 const confirmed=analyzeStrategy([...a,row(206,69.25,{open:67,high:69.5,low:67,volume:200})]);assert.equal(confirmed.frames.at(-1).bounce.signal,true);assert.equal(reboundCandidate(confirmed.frames),null);assert.deepEqual(confirmed.frames.slice(0,a.length),g.frames);
 const ended=analyzeStrategy([...a,...Array.from({length:11},(_,j)=>row(206+j,66))]);assert.equal(reboundCandidate(ended.frames),null);assert.equal(reboundCandidate([]),null);
});
test('candidate permits a falling new low but excludes recovered, chasing, invalid and out-of-date watch frames',()=>{
 const g=analyzeStrategy(history()),base=g.frames.at(-1),make=changes=>reboundCandidate([...g.frames.slice(0,-1),{...base,...changes}]);
 for(const change of[{rsi:40.01},{close:base.ema21},{close:base.bounce.low+2*base.atr+.01},{rsi:null},{atr:0},{bounce:{...base.bounce,index:base.bounce.index-11}},{bounce:{...base.bounce,state:'confirmed'}},{bounce:{...base.bounce,minRsi:31}},{bounce:{...base.bounce,dropPct:14.99}}])assert.equal(make(change),null,JSON.stringify(change));
 assert.equal(make({rsi:40}).state,'watch');assert.equal(make({provisional:true}).provisional,true);
 const fell=analyzeStrategy([...history(),row(206,64,{open:66,high:67,low:63.5})]),c=reboundCandidate(fell.frames);assert.ok(c);assert.equal(c.age,1);assert.equal(c.newLow,true);assert.equal(c.lower,63.5);assert.equal(c.asOf,date(205));assert.equal(c.lowAt,date(206));assert.ok(c.blocked.some(s=>s.includes('다음 봉')));
});
test('scanner uses only closed history, matching chart candidate calculation without changing existing signals',()=>{
 const a=history(),now=new Date('2026-11-14T01:00:00Z'),s=screenRow(item,daily(a),now);assert.deepEqual(s.candidate,reboundCandidate(analyzeStrategy(a).frames));
 const pending={date:'2026-11-13',open:64,high:65,low:60,close:61,volume:100};const during=screenRow(item,[...daily(a),pending],new Date('2026-11-13T16:00:00Z'));assert.equal(during.asOf,date(205));assert.deepEqual(during.candidate,s.candidate);assert.deepEqual(during.signal,s.signal);
 for(const [market,currency,scale]of[['KR','KRW',1000],['JP','JPY',100]]){const bars=a.map(p=>({...p,...Object.fromEntries(['open','high','low','close'].map(k=>[k,p[k]*scale]))}));const r=screenRow({...item,market,currency},daily(bars),now);assert.equal(r.candidate.age,0);assert.ok(Math.abs(r.candidate.lower-65.5*scale)<1e-6);assert.ok(r.candidate.upper>=r.price);}
});
test('candidate age and eligibility are independent of old entry status, while liquidity and country exclusions remain effective',()=>{
 const base={...screenRow(item,daily(history()),new Date('2026-11-14')),liquidity:{average:1e8,median:1e8,activeDays:20},state:'closed',signal:{entryType:'breakout',age:100,entry:9999,tp1:19999,tp2:29999}},second={...base,symbol:'TWO',signal:null,candidate:{...base.candidate,age:4}},old={...base,symbol:'OLD',candidate:null,signal:{entryType:'breakout',age:0},state:'active'};
 const opts={entryType:'reboundCandidate',age:'all',liquidity:'standard'};
 assert.deepEqual(filterScreen([base,second,old],opts).map(p=>p.symbol),['TEST','TWO']);assert.deepEqual(filterScreen([base,second],{...opts,age:3}).map(p=>p.symbol),['TEST']);assert.equal(filterScreen([base],{...opts,market:'JP'}).length,0);assert.equal(filterScreen([base],{...opts,excluded:['US:TEST']}).length,0);assert.equal(filterScreen([base],{...opts,query:'absent'}).length,0);assert.equal(filterScreen([{...base,liquidity:null}],opts).length,0);
 assert.equal(filterScreen([{...base,market:'KR',symbol:'030960',name:'양지사'}],{...opts,liquidity:'all',excludeSpecial:true}).length,0);
 assert.deepEqual(filterScreen([base,second,old],{entryType:'confirmed'}).map(p=>p.symbol),['OLD']);
});
test('merge refuses old shards that lack candidate computation, rather than publishing incomplete candidate coverage',()=>{
 const universe={collectedAt:'2026-11-14T00:00:00Z',items:[],coverage:[]},part={rulesVersion:'independent-v3',patternRulesVersion:1,bounceRulesVersion:1,universeCollectedAt:universe.collectedAt,shards:1,shard:0,items:[]};assert.throws(()=>mergeScreenShards(universe,[part],1),/Mismatched/);assert.equal(mergeScreenShards(universe,[{...part,candidateRulesVersion:1}],1).candidateRulesVersion,1);
});
