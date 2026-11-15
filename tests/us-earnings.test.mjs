import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUsEps,parseUsFinancials,buildUsEarnings,usEarningsNumber,US_EARNINGS_STOCKS} from '../us-earnings-core.mjs';
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
 const old=item(),date='2026-11-14T12:00:00Z';
 const result=await collectUsEarnings({previous:{collectedAt:'2026-11-15T00:00:00Z',markets:{US:{collectedAt:date}},items:[old,{market:'KR',symbol:'005930'}]},charts:[],cache:{},request:async()=>{throw Error('offline');},now});
 assert.equal(result.status,'stale');assert.equal(result.collectedAt,date);assert.equal(result.coverage.failed,30);assert.equal(result.items.length,1);assert.equal(result.items[0].metrics.eps.actual,2.1);assert.equal(result.items[0].stale,true);assert.equal(result.items[0].chart,null);
});

test('US EPS remains usable when supplementary financials fail and provider-mismatched cache is discarded',async()=>{
 const result=await collectUsEarnings({previous:null,charts:US_EARNINGS_STOCKS.map(x=>({market:'US',symbol:x.symbol,providerSymbol:x.symbol+'.O'})),cache:{AAPL:{provider:'WRONG.O',financial:parseUsFinancials(rawFinancial()),info:{fetchedAt:new Date(now).toISOString()}}},request:async url=>{if(!url.includes('earnings-surprise'))throw Error('offline');return rawEps(url.split('/company/')[1].split('/')[0]);},now});
 assert.equal(result.coverage.collected,30);assert.equal(result.coverage.financialFailed,30);assert.equal(result.status,'partial');assert.equal(result.items[0].metrics.eps.actual,2.1);assert.equal(result.items[0].metrics.net,undefined);
});
