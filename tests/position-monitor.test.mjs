import test from 'node:test';
import assert from 'node:assert/strict';
import {parseShortRows,mergeShortDay,parseOccVolume,buildShortMonitor,filterShortRows,buildOptionsMonitor,filterOptionsRows,validatePositionMonitor,retainMonitorPart} from '../position-monitor-core.mjs';
const raw=(code='005930',qty='100,000',amount='2,000,000,000')=>({ISU_CD:code,ISU_ABBRV:'테스트',BAL_QTY:qty,BAL_AMT:amount,LIST_SHRS:'100,000,000',BAL_RTO:'0.10'});
const short=(quantity=100000,listed=1e8)=>({symbol:'005930',name:'삼성전자',market:'KOSPI',quantity,amount:2e9,listed,ratio:quantity/listed*100});
const date=i=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10);
const sd=(i,p)=>({date:date(i),rows:[p],totals:{KOSPI:p.amount,KOSDAQ:0},coverage:[]});
const od=(i,call=1000,put=2000,rows)=>({date:date(i),rows:rows||[{symbol:'ABC',call,put}],totalCall:call,totalPut:put,records:4});
const header='quantity,underlying,symbol,actype,porc,exchange,actdate\n';
test('short balances preserve missing instead of zero and validate ratio and identity',()=>{
 const p=parseShortRows({OutBlock_1:[raw(),raw('000660','-','-')]},date(0),'KOSPI');assert.equal(p.rows.length,1);assert.equal(p.missing,1);assert.equal(p.rows[0].quantity,100000);
 const zero=parseShortRows({OutBlock_1:[{...raw(),BAL_QTY:'0',BAL_AMT:'0',BAL_RTO:'0'}]},date(0),'KOSPI');assert.equal(zero.rows[0].quantity,0);
 assert.throws(()=>parseShortRows({OutBlock_1:[raw(),raw()]},date(0),'KOSPI'),/Duplicate/);
 assert.throws(()=>parseShortRows({OutBlock_1:Array.from({length:20},()=>({...raw(),BAL_RTO:'25'}))},date(0),'KOSPI'),/quality/);
});
test('a market-wide short snapshot cannot silently omit a market or mismatch its date',()=>{
 const p={date:date(0),market:'KOSPI',rows:Array(101).fill(short()),missing:0};assert.throws(()=>mergeShortDay(date(0),[p]),/Incomplete/);assert.throws(()=>mergeShortDay(date(0),[p,{...p,market:'KOSDAQ',date:date(1)}]),/Incomplete/);
});
test('short surge uses quantity not price-driven position value and skips stock-split changes',()=>{
 let p=buildShortMonitor([sd(0,short()),sd(1,{...short(),amount:4e9})]);assert.equal(filterShortRows(p.rows).length,0);
 p=buildShortMonitor([sd(0,short()),sd(1,short(130000))]);assert.equal(filterShortRows(p.rows).length,1);assert.equal(p.rows[0].percent,30);
 p=buildShortMonitor([sd(0,short()),sd(1,short(200000,2e8))]);assert.equal(filterShortRows(p.rows).length,0);assert.equal(filterShortRows(p.rows,{surgeOnly:false}).length,1);
});
test('five-day short comparison checks the matching share count and never fabricates a zero denominator',()=>{
 const days=Array.from({length:6},(_,i)=>sd(i,short(i===5?200000:100000,i===0?5e7:1e8))),p=buildShortMonitor(days);assert.equal(p.fiveDate,date(0));assert.equal(filterShortRows(p.rows,{period:'5'}).length,0);
 const fresh=buildShortMonitor([sd(0,short(0)),sd(1,short(20000))]);assert.equal(fresh.rows[0].percent,null);assert.equal(fresh.rows[0].newBalance,true);assert.equal(filterShortRows(fresh.rows).length,1);
 const absent=buildShortMonitor([{...sd(0,short()),rows:[]},sd(1,short(20000))]);assert.equal(absent.rows[0].previous,null);assert.equal(absent.rows[0].newBalance,false);assert.equal(filterShortRows(absent.rows).length,0);
});
test('OCC contract sides across adjusted roots, capacities and venues become executed contracts',()=>{
 const lines=['500,ABC,1ABC,C,C,CBOE,10/1/2026','500,ABC,1ABC,M,C,CBOE,10/1/2026','100,ABC,ABC,C,P,ISE,10/1/2026','100,ABC,ABC,F,P,ISE,10/1/2026'];
 const p=parseOccVolume(header+lines.join('\n'),date(0));assert.deepEqual(p.rows,[{symbol:'ABC',call:500,put:100}]);assert.equal(p.totalCall,500);assert.equal(p.totalPut,100);
 assert.deepEqual(parseOccVolume(header+[...lines,lines[0]].join('\n'),date(0)).rows,p.rows);
 assert.throws(()=>parseOccVolume(header+[...lines,'501,ABC,1ABC,C,C,CBOE,10/1/2026'].join('\n'),date(0)),/Conflicting/);
});
test('OCC wrong dates, HTML errors, unknown capacity and one-sided partial reports are rejected',()=>{
 assert.throws(()=>parseOccVolume('<html>error</html>',date(0)),/format/);
 assert.throws(()=>parseOccVolume(header+'500,ABC,ABC,C,C,CBOE,10/2/2026',date(0)),/date mismatch/);
 assert.throws(()=>parseOccVolume(header+'500,ABC,ABC,A,C,CBOE,10/1/2026',date(0)),/Invalid/);
 assert.throws(()=>parseOccVolume(header+'501,ABC,ABC,C,C,CBOE,10/1/2026',date(0)),/two-sided/);
});
test('option baseline excludes today and requires all twenty prior reports per underlying',()=>{
 const days=Array.from({length:21},(_,i)=>od(i,i===20?5000:1000,2000)),p=buildOptionsMonitor(days,[{market:'US',symbol:'ABC',name:'회사',exchange:'NASDAQ'}]);assert.equal(p.rows[0].averageCall,1000);assert.equal(p.rows[0].callMultiple,5);assert.equal(p.rows[0].name,'회사');assert.equal(filterOptionsRows(p.rows,{minTotal:1000}).length,1);
 assert.equal(filterOptionsRows(p.rows,{side:'put',minTotal:1000}).length,0);
 assert.equal(filterOptionsRows(p.rows,{multiple:6,minTotal:1000}).length,0);
 days[5]={...days[5],rows:[]};const missing=buildOptionsMonitor(days);assert.equal(missing.rows[0].historyDays,19);assert.equal(missing.rows[0].averageCall,null);assert.equal(filterOptionsRows(missing.rows,{minTotal:1000}).length,0);
});
test('tiny denominators and short histories cannot produce misleading option surges',()=>{
 const p=buildOptionsMonitor(Array.from({length:21},(_,i)=>od(i,i===20?10000:10,0)));assert.equal(filterOptionsRows(p.rows).length,0);assert.equal(filterOptionsRows(p.rows,{surgeOnly:false}).length,1);assert.equal(p.rows[0].putMultiple,null);
 const short=buildOptionsMonitor([od(0),od(1,10000)]);assert.equal(short.rows[0].averageCall,null);assert.equal(filterOptionsRows(short.rows).length,0);
});
test('monitor schema checks ordered date series and stale retention preserves original data timestamps',()=>{
 const kr=buildShortMonitor([sd(0,short()),sd(1,short(150000))],new Date('2026-11-14T00:00:00Z')),us=buildOptionsMonitor(Array.from({length:21},(_,i)=>od(i)),[],new Date('2026-11-14T00:00:00Z')),d={schemaVersion:1,kr,us};assert.equal(validatePositionMonitor(d),true);
 assert.equal(validatePositionMonitor({...d,kr:{...kr,points:[]}}),false);
 assert.equal(validatePositionMonitor({...d,us:{...us,points:[...us.points].reverse()}}),false);
 const retained=retainMonitorPart(kr,new Date('2026-11-15T00:00:00Z'));assert.equal(retained.status,'stale');assert.equal(retained.asOf,kr.asOf);assert.equal(retained.collectedAt,kr.collectedAt);assert.equal(retained.lastAttemptAt,'2026-11-15T00:00:00.000Z');
 assert.equal(validatePositionMonitor({schemaVersion:1,kr:{status:'unavailable',rows:[]},us:{status:'unavailable',rows:[]}}),true);
});
