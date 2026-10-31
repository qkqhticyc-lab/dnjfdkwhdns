import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCreditRow,creditRatio,creditWindow,collectCredit,retainCredit,validateCreditData} from '../credit-core.mjs';
const row=(bizdate,customerDeposit='882975',creditLoan='289137')=>({bizdate,customerDeposit,creditLoan});
test('amounts are source eok, ratio uses the same record, and missing balances never become zero',()=>{
 const p=normalizeCreditRow(row('20261028'));assert.deepEqual(p,{date:'2026-10-28',deposit:882975,credit:289137});assert.equal(p.deposit/10000,88.2975);assert.equal(p.credit/10000,28.9137);assert.ok(Math.abs(creditRatio(p)-32.74577422916843)<1e-10);
 for(const r of [row('20260230'),row('20261028',''),row('20261028','0'),row('20261028','882975',null),row('20261028','882975','-1')])assert.equal(normalizeCreditRow(r),null);
 assert.equal(creditRatio(normalizeCreditRow(row('20261028','100','0'))),0);
});
test('daily pagination preserves paired observations, orders and deduplicates dates, ignores future dates',async()=>{
 const pages=[[row('20261028'),row('20261027')],[row('20261027'),row('20261026')],[row('20261023'),row('20261022')],[row('20261021'),row('20271021'),row('20221021')]],seen=[];
 const data=await collectCredit(async url=>{const i=Number(new URL(url).searchParams.get('startIdx'));seen.push(i);return{ok:true,json:async()=>({number:String(i),content:pages[i]})};},new Date('2026-11-01T00:00:00Z'));
 assert.deepEqual(seen,[0,1,2,3]);assert.equal(data.unit,'억원');assert.equal(data.points.length,6);assert.equal(data.asOf,'2026-10-28');assert.equal(data.points[0].date,'2026-10-21');assert.ok(validateCreditData(data));assert.equal(validateCreditData({...data,unit:'백만원'}),false);assert.equal(validateCreditData({...data,points:[...data.points].reverse()}),false);
 const retained=retainCredit(data,new Date('2026-11-02T00:00:00Z'));assert.equal(retained.status,'stale');assert.equal(retained.asOf,data.asOf);assert.equal(retained.collectedAt,data.collectedAt);assert.deepEqual(retained.points,data.points);
});
test('unavailable or ignored pagination fails instead of fabricating a history',async()=>{
 await assert.rejects(collectCredit(async()=>({ok:false,status:503})),/HTTP 503/);
 await assert.rejects(collectCredit(async()=>({ok:true,json:async()=>({number:0,content:[row('20261028')]})})),/pagination/);
 assert.throws(()=>retainCredit(null),/No valid/);
});
test('month windows are relative to latest provided date and clamp leap/month boundaries',()=>{
 const points=['2024-02-28','2024-02-29','2025-02-28','2025-05-31'].map(date=>({date}));assert.deepEqual(creditWindow(points,3).map(p=>p.date),['2025-02-28','2025-05-31']);assert.deepEqual(creditWindow([{date:'2024-02-29'},{date:'2025-02-28'}],12).map(p=>p.date),['2024-02-29','2025-02-28']);
});
