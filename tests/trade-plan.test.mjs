import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTradePlan,planContext} from '../trade-plan.mjs';
const fixture=()=>Array.from({length:80},(_,i)=>({asOf:new Date(Date.UTC(2026,0,i+1)).toISOString(),open:100,high:103,low:97,close:100,atr:4,ema21:100,ema8:101}));
test('nearby resistance and structural stop replace distant 10-bar low risk multiples',()=>{
 const a=fixture();a[60].high=112;a[70].high=108;a[65].low=90;a.push({...a[0],asOf:'2026-04-01',close:106,high:107,low:103});
 const p=buildTradePlan(a);assert.ok(p.tp1<108&&p.tp1>106);assert.ok(p.tp2<112&&p.tp2>p.tp1);assert.ok(p.stop<97);assert.ok(p.rr<1.5);assert.equal(p.status,'wait');assert.equal(p.support.kind,'확인된 눌림 저점');
});
test('risk limit does not artificially tighten prices or hide poor reward/risk',()=>{
 const a=fixture();a[70].high=112;a.push({...a[0],asOf:'2026-04-01',close:130,high:131,low:125});
 const p=buildTradePlan(a,{maxRiskPct:5}),q=buildTradePlan(a,{maxRiskPct:12});assert.equal(p.stop,q.stop);assert.equal(p.tp1,q.tp1);assert.ok(p.riskPct>5);assert.equal(p.status,'wait');assert.ok(p.reasons.some(x=>x.includes('한도')));assert.ok(p.extended);
});
test('no observed resistance is explicitly a scenario, not a claimed technical target',()=>{
 const a=fixture();a.push({...a[0],asOf:'2026-04-01',close:110,high:112,low:104});const p=buildTradePlan(a);assert.ok(p.tp1>110&&p.tp1<=114);assert.ok(p.tp2>p.tp1&&p.tp2<=118);assert.match(p.first.kind,/시나리오/);assert.equal(p.status,'wait');
});
test('only one resistance leaves second target absent; nearby obstacle is not skipped',()=>{
 const a=fixture();a[70].high=108;a.push({...a[0],asOf:'2026-04-01',close:106,high:107,low:103});const p=buildTradePlan(a);assert.ok(p.tp1<108&&p.tp1>106);assert.equal(p.tp2,null);assert.ok(p.rr<1.5);
});

const rising=()=>Array.from({length:80},(_,i)=>({asOf:new Date(Date.UTC(2026,0,i+1)).toISOString(),open:100+i,high:102+i,low:99+i,close:101+i,atr:3,ema8:100+i,ema21:98+i,ema55:95+i,rsi:60,volumeRatio:1.5}));
test('same price geometry uses RSI and trend strength to reduce overheated targets without tightening stop',()=>{
 const a=rising(),normal=buildTradePlan(a);assert.equal(normal.context.regime,'strongUp');
 const hot=structuredClone(a);hot.at(-1).rsi=80;const overheated=buildTradePlan(hot);
 assert.ok(overheated.tp1<normal.tp1);assert.ok(overheated.tp2<normal.tp2);assert.equal(overheated.stop,normal.stop);assert.ok(overheated.reasons.some(r=>r.includes('RSI 과열')));assert.equal(overheated.status,'wait');
 const fading=structuredClone(a);fading.at(-1).rsi=52;assert.ok(buildTradePlan(fading).tp1<normal.tp1);
});
test('weak RSI is not an oversold buy and missing values are not treated as neutral',()=>{
 const a=rising();a.at(-1).rsi=28;assert.ok(buildTradePlan(a).reasons.some(r=>r.includes('상승 모멘텀 회복')));
 a.at(-1).rsi=null;assert.equal(buildTradePlan(a).context.ready,false);assert.equal(buildTradePlan(a).status,'wait');
 a.at(-1).rsi=60;a.at(-1).volumeRatio=null;assert.ok(buildTradePlan(a).reasons.some(r=>r.includes('거래량 비교 자료')));
});
test('ADX strength never turns falling direction into strong upward targets',()=>{
 const a=rising().map((p,i)=>({...p,open:200-i,high:202-i,low:199-i,close:201-i,ema8:202-i,ema21:204-i,ema55:208-i,rsi:35}));
 const c=planContext(a);assert.ok(c.adx>=25);assert.equal(c.regime,'down');assert.ok(c.minusDI>c.plusDI);assert.equal(c.defensive,true);
});
test('unfinished volume cannot promote a trend and very close resistance remains above entry',()=>{
 const a=rising();a.at(-2).volumeRatio=.5;a.at(-1).provisional=true;a.at(-1).volumeRatio=10;
 assert.equal(planContext(a).volumeRatio,.5);assert.notEqual(planContext(a).regime,'strongUp');
 const b=fixture();b[70].high=106.01;b.push({...b[0],asOf:'2026-04-01',close:106,high:107,low:103});const p=buildTradePlan(b);assert.ok(p.tp1>106&&p.tp1<106.01);assert.equal(p.status,'wait');
});
test('unconfirmed right-bar peaks never become resistance; history prefix is invariant',()=>{
 const a=fixture();a.at(-1).high=140;a.at(-1).close=110;a.at(-1).provisional=true;const p=buildTradePlan(a);assert.match(p.first.kind,/시나리오/);const snapshot=JSON.stringify(buildTradePlan(a.slice(0,70)));a.push({...a[0],asOf:'2026-04-01',high:200,close:180});assert.equal(JSON.stringify(buildTradePlan(a.slice(0,70))),snapshot);
});
test('insufficient/invalid prices produce no levels',()=>{
 assert.equal(buildTradePlan([]).status,'unavailable');const a=fixture();a.at(-1).atr=null;assert.equal(buildTradePlan(a).stop,null);a.at(-1).atr=1000;assert.equal(buildTradePlan(a).stop,null);
});
