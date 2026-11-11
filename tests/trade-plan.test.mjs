import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTradePlan} from '../trade-plan.mjs';
const fixture=()=>Array.from({length:80},(_,i)=>({asOf:new Date(Date.UTC(2026,0,i+1)).toISOString(),open:100,high:103,low:97,close:100,atr:4,ema21:100,ema8:101}));
test('nearby resistance and structural stop replace distant 10-bar low risk multiples',()=>{
 const a=fixture();a[60].high=112;a[70].high=108;a[65].low=90;a.push({...a[0],asOf:'2026-04-01',close:106,high:107,low:103});
 const p=buildTradePlan(a);assert.equal(p.tp1,108);assert.equal(p.tp2,112);assert.equal(p.stop,96);assert.ok(p.rr<1.5);assert.equal(p.status,'wait');assert.equal(p.support.kind,'확인된 눌림 저점');
});
test('risk limit does not artificially tighten prices or hide poor reward/risk',()=>{
 const a=fixture();a[70].high=112;a.push({...a[0],asOf:'2026-04-01',close:130,high:131,low:125});
 const p=buildTradePlan(a,{maxRiskPct:5}),q=buildTradePlan(a,{maxRiskPct:12});assert.equal(p.stop,q.stop);assert.equal(p.tp1,q.tp1);assert.ok(p.riskPct>5);assert.equal(p.status,'wait');assert.ok(p.reasons.some(x=>x.includes('한도')));assert.ok(p.extended);
});
test('no observed resistance is explicitly a scenario, not a claimed technical target',()=>{
 const a=fixture();a.push({...a[0],asOf:'2026-04-01',close:110,high:112,low:104});const p=buildTradePlan(a);assert.equal(p.tp1,114);assert.equal(p.tp2,118);assert.match(p.first.kind,/시나리오/);assert.equal(p.status,'wait');
});
test('only one resistance leaves second target absent; nearby obstacle is not skipped',()=>{
 const a=fixture();a[70].high=108;a.push({...a[0],asOf:'2026-04-01',close:106,high:107,low:103});const p=buildTradePlan(a);assert.equal(p.tp1,108);assert.equal(p.tp2,null);assert.ok(p.rr<1.5);
});
test('unconfirmed right-bar peaks never become resistance; history prefix is invariant',()=>{
 const a=fixture();a.at(-1).high=140;a.at(-1).close=110;a.at(-1).provisional=true;const p=buildTradePlan(a);assert.match(p.first.kind,/시나리오/);const snapshot=JSON.stringify(buildTradePlan(a.slice(0,70)));a.push({...a[0],asOf:'2026-04-01',high:200,close:180});assert.equal(JSON.stringify(buildTradePlan(a.slice(0,70))),snapshot);
});
test('insufficient/invalid prices produce no levels',()=>{
 assert.equal(buildTradePlan([]).status,'unavailable');const a=fixture();a.at(-1).atr=null;assert.equal(buildTradePlan(a).stop,null);a.at(-1).atr=1000;assert.equal(buildTradePlan(a).stop,null);
});
