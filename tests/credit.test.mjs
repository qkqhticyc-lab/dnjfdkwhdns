import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCreditRow,normalizeKofiaCreditRow,normalizeKofiaDepositRow,creditRatio,creditWindow,collectCredit,retainCredit,validateCreditData} from '../credit-core.mjs';
const row=(bizdate,customerDeposit='882975',creditLoan='289137')=>({bizdate,customerDeposit,creditLoan});
test('amounts are source eok, ratio uses the same record, and missing balances never become zero',()=>{
 const p=normalizeCreditRow(row('20261028'));assert.deepEqual(p,{date:'2026-10-28',deposit:882975,credit:289137});assert.equal(p.deposit/10000,88.2975);assert.equal(p.credit/10000,28.9137);assert.ok(Math.abs(creditRatio(p)-32.74577422916843)<1e-10);
 for(const r of [row('20260230'),row('20261028',''),row('20261028','0'),row('20261028','882975',null),row('20261028','882975','-1')])assert.equal(normalizeCreditRow(r),null);
 assert.equal(creditRatio(normalizeCreditRow(row('20261028','100','0'))),0);
});
const loan=(date,total=26549363,kospi=20655024,kosdaq=5894339)=>({TMPV1:date,TMPV2:total,TMPV3:kospi,TMPV4:kosdaq,TMPV9:25486691});
test('KOFIA units and columns match the official Nov 10 table without confusing collateral loans with deposits',()=>{
 assert.deepEqual(normalizeKofiaCreditRow(loan('20261110')),{date:'2026-11-10',credit:265493.63,creditKospi:206550.24,creditKosdaq:58943.39,collateralLoan:254866.91});assert.deepEqual(normalizeKofiaDepositRow({TMPV1:'20261110',TMPV2:85220853}),{date:'2026-11-10',deposit:852208.53});assert.equal(normalizeKofiaCreditRow(loan('20261110',99)),null);assert.equal(normalizeKofiaDepositRow({TMPV1:'20261110'}),null);assert.equal(normalizeKofiaCreditRow(null),null);
});
test('official queries join by date, not row order; missing/future days do not create a misleading ratio',async()=>{
 const seen=[];const data=await collectCredit(async(url,options)=>{const q=JSON.parse(options.body).dmSearch;seen.push(q);return{ok:true,json:async()=>({ds1:q.OBJ_NM.includes('0070')?[loan('20261110'),loan('20261109'),loan('20261109'),loan('20261108'),loan('20271110')]:[{TMPV1:'20261109',TMPV2:88254044},{TMPV1:'20261110',TMPV2:85220853}]})};},new Date('2026-11-11T00:00:00Z'));
 assert.equal(seen.length,2);assert.ok(seen.every(q=>q.tmpV40==='1000000'&&q.tmpV1==='D'));assert.equal(data.sourceProvider,'KOFIA');assert.equal(data.unit,'억원');assert.equal(data.points.length,2);assert.equal(data.asOf,'2026-11-10');assert.equal(data.points[0].date,'2026-11-09');assert.equal(data.points.at(-1).deposit,852208.53);assert.ok(validateCreditData(data));assert.equal(validateCreditData({...data,unit:'백만원'}),false);assert.equal(validateCreditData({...data,points:[...data.points].reverse()}),false);
 const retained=retainCredit(data,new Date('2026-11-02T00:00:00Z'));assert.equal(retained.status,'stale');assert.equal(retained.asOf,data.asOf);assert.equal(retained.collectedAt,data.collectedAt);assert.deepEqual(retained.points,data.points);
});
test('unavailable or malformed official responses fail instead of fabricating a history',async()=>{
 await assert.rejects(collectCredit(async()=>({ok:false,status:503})),/HTTP 503/);
 await assert.rejects(collectCredit(async()=>({ok:true,json:async()=>({number:0,content:[row('20261028')]})})),/KOFIA/);
 assert.throws(()=>retainCredit(null),/No valid/);
});
test('month windows are relative to latest provided date and clamp leap/month boundaries',()=>{
 const points=['2024-02-28','2024-02-29','2025-02-28','2025-05-31'].map(date=>({date}));assert.deepEqual(creditWindow(points,3).map(p=>p.date),['2025-02-28','2025-05-31']);assert.deepEqual(creditWindow([{date:'2024-02-29'},{date:'2025-02-28'}],12).map(p=>p.date),['2024-02-29','2025-02-28']);
});
