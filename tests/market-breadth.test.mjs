import test from 'node:test';import assert from 'node:assert/strict';
import {aggregateBreadth,nyseCounts,zweig,normalizedPrices,priceRows,validateBreadth} from '../market-breadth-core.mjs';
const calendar=n=>Array.from({length:n},(_,i)=>{const d=new Date('2025-01-01T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});
test('breadth computes separate moving averages with observed denominators and coverage gates',()=>{
 const dates=calendar(240),up=dates.map((date,i)=>({date,adjusted:100+i})),down=dates.map((date,i)=>({date,adjusted:400-i}));
 const r=aggregateBreadth([up,down],dates,2);assert.equal(r[18].ma20.value,null);assert.equal(r[19].ma20.value,50);assert.equal(r[199].ma200.value,50);
 const missing=down.filter((_,i)=>i!==220),g=aggregateBreadth([up,missing],dates,2);assert.equal(g[239].ma20.value,null);assert.equal(g[219].ma20.value,50);assert.equal(g[239].ma20.eligible,1);
 assert.equal(aggregateBreadth([up],dates,2).at(-1).ma200.value,null);
});
test('prices have identical base date, no dividend-return claim, identity and cutoff guarded',()=>{
 const r=normalizedPrices([{date:'2026-11-19',SPY:100,RSP:50},{date:'2026-11-20',SPY:110,RSP:60}]);[r[0].SPY,r[0].RSP,r[1].SPY,r[1].RSP].forEach((v,i)=>assert.ok(Math.abs(v-[100,100,110,120][i])<1e-9));
 const json={chart:{result:[{meta:{symbol:'SPY'},timestamp:[Date.parse('2026-11-19T15:00Z')/1000,Date.parse('2026-11-20T15:00Z')/1000],indicators:{quote:[{close:[100,105]}],adjclose:[{adjclose:[99,104]}]}}]}};
 assert.deepEqual(priceRows(json,'SPY','2026-11-19'),[{date:'2026-11-19',close:100,adjusted:99}]);assert.throws(()=>priceRows(json,'RSP','2026-11-20'));
});
test('NYSE parsing and ZBT preserve missing history and warm-up, EMA uses counts not supplied indicator',()=>{
 const dates=calendar(50),rows=dates.map((date,i)=>({date,adv:i<35?10:99,dec:i<35?90:1}));
 const r=zweig(rows,dates);assert.equal(r[8].value,null);assert.ok(Math.abs(r[9].value-.1)<1e-9);assert.equal(r[9].approximate,true);assert.equal(r[29].approximate,false);assert.ok(r.some(p=>p.signal));
 const g=zweig(rows.filter((_,i)=>i!==40),dates);assert.equal(g[40].value,null);assert.equal(g[49].value,null);
 const payload={nyse:{dates:['2026-11-19','2026-11-20'],adv:[100,200],dec:[200,100]}};assert.equal(nyseCounts(payload,'2026-11-19').length,1);assert.throws(()=>nyseCounts({nyse:{dates:['2026-11-20'],adv:[-1],dec:[1]}},'2026-11-20'));
});
test('validated published snapshot has 0–100 breadth and 0–1 ZBT values',()=>{
 const date='2026-11-20',bucket={above:1,eligible:2,total:2,value:50},d={schemaVersion:1,asOf:date,prices:[{date,SPY:100,RSP:50}],breadth:[{date,ma20:bucket,ma50:bucket,ma200:bucket}],zbt:[{date,value:.5}],nyseRaw:[{date,adv:1,dec:1}]};assert.equal(validateBreadth(d),true);assert.equal(validateBreadth({...d,zbt:[{date,value:1.5}]}),false);assert.equal(validateBreadth({...d,prices:[{date,SPY:0,RSP:50}]}),false);
});
