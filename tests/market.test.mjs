import test from 'node:test';import assert from 'node:assert/strict';import {collectMarket} from '../scripts/market-core.mjs';
test('cash uses KRW/100million, futures uses contracts, and afterhours are excluded from overlay',async()=>{
 const result=await collectMarket(async url=>{
  const code=url.includes('marketType=FUT')||url.includes('/FUT')?'FUT':url.includes('KOSDAQ')?'KOSDAQ':'KOSPI';
  let body;if(url.includes('/basic'))body={stockName:code,closePrice:'1000',fluctuationsRatio:'1',marketStatus:'CLOSE'};
  else if(url.includes('/chart/'))body={tradeBaseAt:'20261030',lastClosePrice:900,priceInfos:[{localDateTime:'20261030090000',currentPrice:950},{localDateTime:'20261030153000',currentPrice:1000}]};
  else body={last:true,content:['083000','090000','153000','160000'].map(time=>({bizdate:'20261030',time,netAmounts:[{investorGubun:'9000',diffValue:code==='FUT'?'6002':'12300000000'}]}))};
  return{ok:true,json:async()=>body};
 });
 assert.equal(result.markets.FUT.unit,'계약');assert.equal(result.markets.FUT.points[0].foreignNet,6002);
 assert.equal(result.markets.KOSPI.unit,'억원');assert.equal(result.markets.KOSPI.points[0].foreignNet,123);
 assert.deepEqual(result.markets.KOSPI.points.map(p=>p.time),['09:00','15:30']);
 assert.equal(result.options.status,'unavailable');
});
test('a failed source is explicitly unavailable instead of returning invented numbers',async()=>{
 const d=await collectMarket(async()=>({ok:false,status:503}));
 assert.ok(Object.values(d.markets).every(m=>m.status==='unavailable'&&!m.points&&!m.price));
});
