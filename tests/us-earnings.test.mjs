import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUsEps,parseUsFinancials,buildUsEarnings,usEarningsNumber,US_EARNINGS_STOCKS,selectUsEarningsStocks,parseUsUpcoming,upcomingEarningsState} from '../us-earnings-core.mjs';
import {earningsDecision,earningsVerdict,validEarnings} from '../earnings-core.mjs';
import {collectUsEarnings} from '../scripts/us-earnings-source.mjs';

const now=Date.parse('2026-11-15T12:00:00Z');
const rawEps=(symbol='AAPL')=>({status:{rCode:200},data:{symbol:symbol.toLowerCase(),earningsSurpriseTable:{rows:[{fiscalQtrEnd:'Sep 2026',dateReported:'11/2/2026',eps:2.1,consensusForecast:'1.98'},{fiscalQtrEnd:'Jun 2026',dateReported:'7/30/2026',eps:0,consensusForecast:'(0.20)'}]}}});
const rawFinancial=()=>({isKrw:false,unit:'USD(백만). %, 배 생략',trTitleList:[{key:'2026.09.26',isConsensus:'N'},{key:'2025.09.27',isConsensus:'N'},{key:'2026.12.26',isConsensus:'Y'}],rowList:['매출액','EBIT','당기순이익'].map(title=>({title,columns:{'2026.09.26':{value:'120,000.25',krw:'999999'},'2025.09.27':{value:'100,000.00'},'2026.12.26':{value:'500000'}}}))});
function item() {
 const data=buildUsEarnings({symbol:'AAPL',name:'애플'},parseUsEps(rawEps(),'AAPL',now),parseUsFinancials(rawFinancial()),{},now);
 data.chart={market:'US',symbol:'AAPL',status:'ok',asOf:'2026-11-13',price:100,rankInputs:{shortAligned:true,mediumAligned:true},liquidity:{average:5e7,median:3e7,activeDays:20},volumeRatio:2,signal:{status:'active',provisional:false,asOf:'2026-11-11',age:2,entryType:'breakout',entryLabel:'돌파 진입',entry:100,initialStop:95,tp1:110}};
 return data;
}

test('US EPS parsing preserves decimals, zero and losses and checks identity, dates and unique fiscal months',()=>{
 assert.equal(usEarningsNumber('$1,234.50'),1234.5);assert.equal(usEarningsNumber('(0.25)'),-.25);
 for(const value of ['N/A','',null,'100 USD',Infinity])assert.equal(usEarningsNumber(value),null);
 const data=rawEps(),rows=parseUsEps(data,'AAPL',now);
 assert.equal(rows[0].period,'2026-09');assert.equal(rows[0].announcedOn,'2026-11-02');assert.equal(rows[1].metrics.eps.actual,0);assert.equal(rows[1].metrics.eps.forecast,-.2);
 assert.throws(()=>parseUsEps(data,'MSFT',now));
 data.data.earningsSurpriseTable.rows.push({...data.data.earningsSurpriseTable.rows[0]});assert.throws(()=>parseUsEps(data,'AAPL',now));
 data.data.earningsSurpriseTable.rows=[{fiscalQtrEnd:'Dec 2026',dateReported:'1/1/2027',eps:2,consensusForecast:'1'},{fiscalQtrEnd:'Sep 2026',dateReported:'11/2/2026',eps:'N/A'}];
 assert.throws(()=>parseUsEps(data,'AAPL',now));
});

test('US financials retain original reporting currency and exact fiscal date and exclude forecast columns',()=>{
 for(const currency of ['USD','TWD','EUR']){
  const raw=rawFinancial();raw.unit=currency+'(백만)';const data=parseUsFinancials(raw);
  assert.equal(data.currency,currency);assert.equal(data.rows.length,2);assert.equal(data.rows[0].metrics.revenue.actual,120000.25);assert.equal(data.rows[0].periodEnd,'2026-09-26');
 }
 assert.throws(()=>parseUsFinancials({...rawFinancial(),isKrw:true}));
 const raw=rawFinancial();raw.trTitleList.push({key:'2026.09.30',isConsensus:'N'});
 assert.equal(parseUsFinancials(raw).rows.some(row=>row.period==='2026-09'),false);
});

test('US reports join only matching fiscal months and never derive net income from EPS',()=>{
 const current=item();assert.equal(current.metrics.eps.forecast,1.98);assert.equal(current.financialCurrency,'USD');assert.ok(current.revenueGrowthYoY>20);
 const financial=parseUsFinancials(rawFinancial());financial.rows[0].period='2026-08';
 const missing=buildUsEarnings({symbol:'AAPL',name:'애플'},parseUsEps(rawEps(),'AAPL',now),financial,{},now);
 assert.equal(missing.metrics.net,undefined);assert.equal(missing.financialStatus,'unavailable');assert.equal(missing.revenueGrowthYoY,null);
 financial.rows[0].period='2026-09';financial.rows[0].periodEnd='2026-11-03';
 assert.equal(buildUsEarnings({symbol:'AAPL',name:'애플'},parseUsEps(rawEps(),'AAPL',now),financial,{},now).metrics.net,undefined);
});

test('US schema and EPS verdict preserve the comparison basis and reject invalid currency and period',()=>{
 assert.equal(validEarnings({schemaVersion:1,status:'ok',items:[item()]}),true);
 assert.equal(earningsVerdict(item()).label,'EPS 서프라이즈');
 for(const change of [x=>x.currency='KRW',x=>x.period='2026-13',x=>x.metrics.eps.actual=null,x=>x.market='JP',x=>x.basis='consolidated']){const row=item();change(row);assert.equal(validEarnings({schemaVersion:1,status:'ok',items:[row]}),false);}
 const row=item();row.metrics.eps.actual=1;assert.equal(earningsVerdict(row).kind,'shock');
});

test('US buy review uses EPS, verified revenue growth, US liquidity and post-release confirmed entries',()=>{
 assert.equal(earningsDecision(item(),now).kind,'buy');
 for(const change of [x=>x.financialStatus='unavailable',x=>x.financialStale=true,x=>x.revenueGrowthYoY=null,x=>x.revenueGrowthYoY=-1,x=>x.metrics.net.actual=-1,x=>x.metrics.eps.forecast=null,x=>x.announcedOn='2026-08-01',x=>x.chart.liquidity.average=1e7,x=>x.chart.market='KR',x=>x.chart.signal.asOf=x.announcedOn,x=>x.chart.signal.provisional=true]){const row=item();change(row);assert.notEqual(earningsDecision(row,now).kind,'buy');}
});

test('US chart freshness uses New York market close with daylight saving',()=>{
 const row=item();row.announcedOn='2026-10-28';row.chart.signal.asOf='2026-10-29';row.chart.asOf='2026-10-30';
 assert.equal(earningsDecision(row,Date.parse('2026-10-30T19:59:00Z')).kind,'unavailable');
 assert.equal(earningsDecision(row,Date.parse('2026-10-30T20:01:00Z')).kind,'buy');
 row.chart.asOf='2026-11-02';assert.equal(earningsDecision(row,Date.parse('2026-11-02T20:59:00Z')).kind,'unavailable');
 assert.equal(earningsDecision(row,Date.parse('2026-11-02T21:01:00Z')).kind,'buy');
});

test('US primary-source failure retains verified US values and original timestamp independently of Korea',async()=>{
 const old=item(),date='2026-11-14T12:00:00Z';old.earningsFetchedAt=date;
 const result=await collectUsEarnings({previous:{collectedAt:'2026-11-15T00:00:00Z',markets:{US:{collectedAt:date}},items:[old,{market:'KR',symbol:'005930'}]},charts:[],cache:{},request:async()=>{throw Error('offline');},now});
 assert.equal(result.status,'stale');assert.equal(result.collectedAt,date);assert.equal(result.coverage.failed,30);assert.equal(result.items.length,1);assert.equal(result.items[0].metrics.eps.actual,2.1);assert.equal(result.items[0].stale,true);assert.equal(result.items[0].chart,null);
});

test('US EPS remains usable when supplementary financials fail and provider-mismatched cache is discarded',async()=>{
 const result=await collectUsEarnings({previous:null,charts:US_EARNINGS_STOCKS.map(x=>({market:'US',symbol:x.symbol,providerSymbol:x.symbol+'.O'})),cache:{AAPL:{provider:'WRONG.O',financial:parseUsFinancials(rawFinancial()),info:{fetchedAt:new Date(now).toISOString()}}},request:async url=>{if(!url.includes('earnings-surprise'))throw Error('offline');return rawEps(url.split('/company/')[1].split('/')[0]);},now});
 assert.equal(result.coverage.collected,30);assert.equal(result.coverage.financialFailed,30);assert.equal(result.status,'partial');assert.equal(result.items[0].metrics.eps.actual,2.1);assert.equal(result.items[0].metrics.net,undefined);
});

const forecast=()=>({status:{rCode:200},data:{symbol:'nvda',quarterlyForecast:{rows:[{fiscalEnd:'Oct 2026',consensusEPSForecast:2.49,lowEPSForecast:2.34,highEPSForecast:2.7,noOfEstimates:13},{fiscalEnd:'Jan 2027',consensusEPSForecast:2.75}]},yearlyForecast:{rows:[{fiscalEnd:'Jan 2027'}]}}});
const nextDate=()=>({status:{rCode:200},data:{heading:'NVDA Earnings Date',reportText:'NVIDIA is expected* to report earnings on  11/17/2026 after market close. The report will be for the fiscal Quarter ending Oct 2026. According to Zacks, based on 13 analysts forecasts, the consensus EPS forecast for the quarter is $2.49.'}});

test('upcoming EPS keeps estimates separate from actuals and identifies the correct fiscal year and quarter',()=>{
 const upcoming=parseUsUpcoming(nextDate(),forecast(),'NVDA','2026-07',now);
 assert.equal(upcoming.period,'2026-10');assert.equal(upcoming.fiscalYear,2027);assert.equal(upcoming.fiscalQuarter,3);
 assert.equal(upcoming.announcedOn,'2026-11-17');assert.equal(upcoming.time,'after-hours');assert.equal(upcoming.epsForecast,2.49);assert.equal(upcoming.epsLow,2.34);assert.equal(upcoming.epsHigh,2.7);assert.equal(upcoming.analysts,13);
 const report={...item(),symbol:'NVDA',period:'2026-07',upcoming};assert.equal(upcomingEarningsState(report,now).label,'발표 전');
 assert.equal(upcomingEarningsState(report,Date.parse('2026-11-18T12:00:00Z')).label,'발표 확인 대기');
 assert.equal(validEarnings({schemaVersion:1,status:'ok',items:[report]}),true);
 report.upcoming.epsForecast=Infinity;assert.equal(validEarnings({schemaVersion:1,status:'ok',items:[report]}),false);
});

test('estimated notices without fiscal months attach dates only after unique matching EPS confirms the next quarter',()=>{
 const data=nextDate();data.data.reportText='NVIDIA is estimated to report earnings on 11/17/2026. The consensus EPS forecast for the quarter is $2.49.';
 assert.equal(parseUsUpcoming(data,forecast(),'NVDA','2026-07',now).announcedOn,'2026-11-17');
 data.data.reportText=data.data.reportText.replace('$2.49','$9.99');
 assert.equal(parseUsUpcoming(data,forecast(),'NVDA','2026-07',now).announcedOn,null);
});

test('forecast-only quarters have no invented release date and a completed quarter clears its pending result',()=>{
 const upcoming=parseUsUpcoming(null,forecast(),'NVDA','2026-07',now);
 assert.equal(upcoming.announcedOn,null);assert.equal(upcoming.epsForecast,2.49);assert.equal(upcoming.status,'partial');
 assert.equal(parseUsUpcoming(nextDate(),{...forecast(),data:{...forecast().data,symbol:'AAPL'}},'NVDA','2026-10',now),null);
 const next=parseUsUpcoming(nextDate(),forecast(),'NVDA','2026-10',now);assert.equal(next.period,'2027-01');assert.equal(next.announcedOn,null);assert.equal(next.epsForecast,2.75);
 assert.equal(upcomingEarningsState({...item(),upcoming:{...upcoming,period:item().period}},now),null);
});

test('upcoming earnings within seven days postpone buy review without comparing forecasts as reported values',()=>{
 const row=item();row.upcoming={...parseUsUpcoming(nextDate(),forecast(),'NVDA','2026-07',now),period:'2026-12'};
 assert.equal(earningsDecision(row,now).label,'실적 발표 전 · 진입 대기');
 row.upcoming.announcedOn='2026-11-14';assert.equal(earningsDecision(row,now).label,'새 실적 확인 대기');
 row.upcoming.announcedOn='2027-01-15';assert.equal(earningsDecision(row,now).kind,'buy');
});

test('expanded US scope retains existing representatives and adds highest dollar-turnover eligible shares up to 200',()=>{
 const symbol=index=>'Z'+String.fromCharCode(65+Math.floor(index/26))+String.fromCharCode(65+index%26);
 const rows=Array.from({length:230},(_,index)=>({market:'US',symbol:symbol(index),name:'Company '+index,status:'ok',liquidity:{average:2e7+index*1e6,activeDays:20}}));
 rows.push({market:'US',symbol:'LOW',name:'thin',status:'ok',liquidity:{average:1e6,activeDays:20}},{market:'JP',symbol:'WRONG',status:'ok',liquidity:{average:1e15,activeDays:20}});
 const selected=selectUsEarningsStocks(rows);assert.equal(selected.length,200);assert.ok(US_EARNINGS_STOCKS.every(x=>selected.some(y=>y.symbol===x.symbol)));
 assert.ok(selected.some(x=>x.symbol===symbol(229)));assert.ok(!selected.some(x=>x.symbol===symbol(0)||x.symbol==='LOW'||x.symbol==='WRONG'));
 assert.equal(new Set(selected.map(x=>x.symbol)).size,200);
 assert.equal(selectUsEarningsStocks([],selected.map(x=>({...x,market:'US'}))).length,200);
});

test('schedule source outage preserves previous pending estimates with their original time and disables freshness',async()=>{
 const pending=parseUsUpcoming(nextDate(),forecast(),'NVDA','2026-07',now-86400000),cache={NVDA:{provider:'NVDA.O',next:{version:1,latestPeriod:'2026-07',fetchedAt:pending.fetchedAt,upcoming:pending,status:'ok'}}};
 const result=await collectUsEarnings({previous:null,charts:[{market:'US',symbol:'NVDA',providerSymbol:'NVDA.O'}],cache,now,request:async url=>{
  if(!url.includes('/earnings-surprise'))throw Error('offline');
  const symbol=url.split('/company/')[1].split('/')[0],raw=rawEps(symbol);
  if(symbol==='NVDA')raw.data.earningsSurpriseTable.rows[0].fiscalQtrEnd='Jul 2026';
  return raw;
 }});
 const row=result.items.find(x=>x.symbol==='NVDA');assert.equal(row.upcoming.status,'stale');assert.equal(row.upcoming.epsForecast,2.49);assert.equal(row.upcoming.fetchedAt,pending.fetchedAt);assert.equal(row.metrics.eps.actual,2.1);
});

test('verified reports use a six-hour cache and release-day reports recheck after fifteen minutes',async()=>{
 const pending={...parseUsUpcoming(nextDate(),forecast(),'NVDA','2026-07',now),period:'2026-12',announcedOn:'2026-11-25'};
 const rows=US_EARNINGS_STOCKS.map(stock=>({...item(),symbol:stock.symbol,upcoming:pending})),charts=rows.map(row=>({market:'US',symbol:row.symbol,providerSymbol:row.symbol+'.O'}));
 const cache=Object.fromEntries(rows.map(row=>[row.symbol,{provider:row.symbol+'.O',financial:parseUsFinancials(rawFinancial()),info:{fetchedAt:new Date(now).toISOString()},next:{version:1,latestPeriod:row.period,fetchedAt:new Date(now).toISOString(),upcoming:pending,status:'ok'}}]));
 let calls=0;
 const result=await collectUsEarnings({previous:{items:rows},charts,cache,now,request:async()=>{calls++;throw Error('Unexpected fetch');}});
 assert.equal(result.coverage.cached,30);assert.equal(result.coverage.collected,30);assert.equal(calls,0);
 for(const row of rows){row.upcoming={...pending,announcedOn:'2026-11-15'};row.earningsFetchedAt=new Date(now-20*60000).toISOString();}
 let reports=0;
 await collectUsEarnings({previous:{items:rows},charts,cache,now,request:async url=>{if(url.includes('/earnings-surprise')){reports++;return rawEps(url.split('/company/')[1].split('/')[0]);}throw Error('offline');}});
 assert.equal(reports,30);
});

test('access denial stops further provider calls and persists a retry interval',async()=>{
 const cache={};let calls=0;
 const request=async()=>{calls++;throw Error('Source HTTP 403');};
 await collectUsEarnings({previous:null,charts:[],cache,request,now});
 assert.ok(calls>0&&calls<=6);assert.equal(cache._nasdaqRetryAfter,now+3600000);
 calls=0;await collectUsEarnings({previous:null,charts:[],cache,request,now:now+1000});assert.equal(calls,0);
});
