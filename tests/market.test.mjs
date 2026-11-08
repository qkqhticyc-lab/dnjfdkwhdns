import test from 'node:test';import assert from 'node:assert/strict';import {collectMarket,foreignNetAmount} from '../scripts/market-core.mjs';
test('cash combines observed KRX/NXT amounts and retains the complete flow independently of index hours',async()=>{
 const result=await collectMarket(async url=>{
  const code=url.includes('marketType=FUT')||url.includes('/FUT')?'FUT':url.includes('KOSDAQ')?'KOSDAQ':'KOSPI';
  let body;if(url.includes('/basic'))body={stockName:code,closePrice:'1000',fluctuationsRatio:'1',marketStatus:'CLOSE'};
  else if(url.includes('/chart/'))body={tradeBaseAt:'20261030',lastClosePrice:900,priceInfos:[{localDateTime:'20261030090000',currentPrice:950},{localDateTime:'20261030153000',currentPrice:1000}]};
  else body={last:true,content:['083000','090000','153000','160000'].map(time=>({bizdate:'20261030',time,netAmounts:[{investorGubun:'9000',diffValue:code==='FUT'?'6002':url.includes('tradeType=NXT')?'200000000':'12300000000',buyPrice:'29870093',sellPrice:'28512129'}]}))};
  return{ok:true,json:async()=>body};
 });
 assert.equal(result.markets.FUT.unit,'억원');assert.equal(result.markets.FUT.points[0].foreignNet,13579.64);assert.equal(result.markets.FUT.measure,'netAmount');
 assert.equal(result.markets.KOSPI.unit,'억원');assert.equal(result.markets.KOSPI.points[0].foreignNet,125);assert.equal(result.markets.KOSPI.scope,'KRX+NXT');
 assert.deepEqual(result.markets.KOSPI.points.map(p=>p.time),['08:30','09:00','15:30','16:00']);
 assert.equal(result.options.status,'separate');
});
test('missing futures transaction amounts never fall back to contract count or zero',()=>{
 assert.equal(foreignNetAmount('FUT',{diffValue:'6002'}),null);
 assert.equal(foreignNetAmount('FUT',{buyPrice:' ',sellPrice:'10'}),null);
 assert.equal(foreignNetAmount('FUT',{buyPrice:'0',sellPrice:'100'}),-1);
 assert.equal(foreignNetAmount('FUT',{buyPrice:'100',sellPrice:'100'}),0);
});
test('a failed source is explicitly unavailable instead of returning invented numbers',async()=>{
 const d=await collectMarket(async()=>({ok:false,status:503}));
 assert.ok(Object.values(d.markets).every(m=>m.status==='unavailable'&&!m.points&&!m.price));
});
