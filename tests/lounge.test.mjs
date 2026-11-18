import test from 'node:test';
import assert from 'node:assert/strict';
import {loungeStocks,loungeTrend,loungeSectors} from '../lounge-core.mjs';
const item=(symbol,extra={})=>({market:'KR',symbol,name:symbol,status:'ok',asOf:'2026-11-17',price:100,changePercent:2,trend:'up',liquidity:{average:2e10,median:1e10,activeDays:20},signal:{status:'active',age:1,entryType:'breakout',entry:100,initialStop:95,tp1:110},...extra});
test('overview uses latest matching closed date and the existing liquidity and exclusion rules',()=>{
 const snapshot=loungeStocks([item('005930'),item('000660',{asOf:'2026-11-16'}),item('030960'),item('123456',{liquidity:{average:10,median:10,activeDays:20}}),item('AMD',{market:'US'})],'KR');
 assert.equal(snapshot.asOf,'2026-11-17');assert.equal(snapshot.rows.length,1);assert.equal(snapshot.new.length,1);assert.equal(snapshot.breadth,100);
});
test('signal views distinguish new, active and setups and respect entry type',()=>{
 const rows=[item('005930'),item('000660',{signal:{status:'active',age:4,entryType:'pullback',entry:100}}),item('123456',{state:'setup',signal:null})];
 const snapshot=loungeStocks(rows,'KR');assert.equal(snapshot.new.length,1);assert.equal(snapshot.active.length,2);assert.equal(snapshot.setup.length,1);
 assert.equal(loungeStocks(rows,'KR','pullback').active.length,1);assert.equal(loungeStocks([],'US').breadth,null);
});
test('market trend excludes intraday unfinished daily observation',()=>{
 const end=Date.parse('2026-11-18T00:00Z'),points=Array.from({length:70},(_,index)=>({date:new Date(end-(69-index)*86400000).toISOString().slice(0,10),close:100+index}));
 points.at(-1).close=1;
 const before=loungeTrend({points},'KR',new Date('2026-11-18T05:00Z')),after=loungeTrend({points},'KR',new Date('2026-11-18T07:00Z'));
 assert.equal(before.asOf,'2026-11-17');assert.equal(before.state,'up');assert.equal(after.asOf,'2026-11-18');assert.notEqual(after.state,'up');assert.equal(loungeTrend(null,'US').state,'unknown');
});
test('sector means require three classified stocks and preserve each group sample size',()=>{
 const rows=[item('A'),item('B',{changePercent:4}),item('C',{changePercent:-3}),item('D')],sectors=new Map([['KR:A',{id:'technology'}],['KR:B',{id:'technology'}],['KR:C',{id:'technology'}],['KR:D',{id:'energy'}]]);
 const result=loungeSectors(rows,sectors);assert.equal(result.length,1);assert.equal(result[0].count,3);assert.equal(result[0].average,1);
});
