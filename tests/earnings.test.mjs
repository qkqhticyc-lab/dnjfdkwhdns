import test from 'node:test';
import assert from 'node:assert/strict';
import {earningsNumber,jsonLiteral,parseEarningsMarket,mergeEarningsMarkets,mergeEarningsHistory,parseEarningsDates,financeHistory,surprise,earningsVerdict,earningsDecision,validEarnings} from '../earnings-core.mjs';

const fixture = () => ({
 symbol:'123456',name:'테스트기업',period:'2026/3',basis:'consolidated',announcedOn:'2026-11-10',
 metrics:{revenue:{actual:120,forecast:100},operating:{actual:12,forecast:10},net:{actual:9,forecast:8}},
 chart:{market:'KR',symbol:'123456',status:'ok',asOf:'2026-11-13',price:100,rankInputs:{shortAligned:true,mediumAligned:true},liquidity:{average:5e10,median:3e10,activeDays:20},volumeRatio:2,
  signal:{status:'active',provisional:false,asOf:'2026-11-11',age:2,entryType:'breakout',entryLabel:'돌파 진입',entry:100,initialStop:95,tp1:110}}
});
const now=Date.parse('2026-11-15T12:00:00Z');

test('signed earnings numbers preserve zero and reject missing, nonfinite and unit strings',()=>{
 assert.equal(earningsNumber('1,234.5'),1234.5);assert.equal(earningsNumber('-123'),-123);assert.equal(earningsNumber(0),0);
 for(const value of ['',null,undefined,'-',Infinity,'100억원','1e99'])assert.equal(earningsNumber(value),null);
 assert.deepEqual(jsonLiteral('[{"value":"a]b"}] trailing',0),[{value:'a]b'}]);
 assert.throws(()=>jsonLiteral('[globalThis.bad()]',0));assert.throws(()=>jsonLiteral('[1}',0));
});

test('source market parsing joins a metric only within its symbol, quarter and accounting basis',()=>{
 const row=['123456','123456|테스트기업','','','','120.0','100.0','20.0','연결'];
 const html='<td class="center on" id="td_sup1">매출액</td> 어닝서프라이즈 var changeYYMM = [["2026/3"],["2026/3"]]; var changeSup = [{dest:'+JSON.stringify([[row]])+'},{dest:[[]]}];';
 const parsed=parseEarningsMarket(html,'revenue');assert.equal(parsed[0].period,'2026/3');assert.equal(parsed[0].actual,120);
 assert.equal(mergeEarningsMarkets(parsed)[0].metrics.revenue.forecast,100);
 assert.equal(mergeEarningsMarkets([...parsed,{...parsed[0],basis:'separate'}]).length,2);
 assert.throws(()=>mergeEarningsMarkets([...parsed,...parsed]));
 assert.throws(()=>parseEarningsMarket(html.replace('123456|','999999|'),'revenue'));
 assert.throws(()=>parseEarningsMarket(html.replace('2026/3','2026/9'),'revenue'));
 assert.throws(()=>parseEarningsMarket(html,'operating'));
});

test('history joins use the latest matching quarter and preserve the published quarter over later estimates',()=>{
 const current=fixture();
 const markets=[current,{...current,period:'2026/2',metrics:{revenue:{actual:100.1,forecast:90},operating:{actual:10.1,forecast:9},net:{actual:8.1,forecast:7}}},{...current,period:'2025/4',metrics:{operating:{actual:8,forecast:9}}}];
 const financial=[{period:'2025/4',basis:'consolidated',metrics:{revenue:{actual:90,forecast:null},operating:{actual:11,forecast:null},net:{actual:7,forecast:null}}},{period:'2026/2',basis:'consolidated',metrics:{revenue:{actual:100,forecast:null},operating:{actual:10,forecast:null},net:{actual:8,forecast:null}}}];
 const merged=mergeEarningsHistory(current,markets,financial);
 assert.equal(merged[0].metrics.revenue.forecast,100);
 assert.equal(merged.at(-1).metrics.net.actual,7);
 assert.equal(merged.at(-1).source,'확정 실적 집계');
 financial[1].metrics.revenue.actual=1000;
 assert.equal(mergeEarningsHistory(current,markets,financial).at(-1).metrics.net,undefined);
});

test('announcement dates and quarterly history exclude estimated values and separate net-income definitions',()=>{
 const html='cmp_cd=123456 var EarnigList = function(){var res = {"yymm":["202609","202606"],"yymmdd":["2026/11/10(연결)","2026/08/10(별도)"]};}';
 assert.deepEqual(parseEarningsDates(html,'123456').map(row=>[row.period,row.basis,row.date]),[['2026/3','consolidated','2026-11-10'],['2026/2','separate','2026-08-10']]);
 assert.throws(()=>parseEarningsDates(html,'999999'));
 const raw={itemCode:'123456',financePeriodType:'quarter',financeInfo:{itemCode:'123456',trTitleList:[{key:'202606',isConsensus:'N'},{key:'202609',isConsensus:'Y'}],rowList:[{title:'지배주주순이익',columns:{'202606':{value:'9'}}},{title:'당기순이익',columns:{'202606':{value:'10'}}}]}};
 assert.equal(financeHistory(raw,'123456','consolidated')[0].metrics.net.actual,9);
 assert.equal(financeHistory(raw,'123456','separate')[0].metrics.net.actual,10);
 assert.equal(financeHistory(raw,'123456','consolidated').length,1);
 assert.throws(()=>financeHistory(raw,'999999','consolidated'));
});

test('surprise handles losses, zero estimates and exact equality without invented percentages',()=>{
 assert.equal(surprise(-50,-100).percent,50);assert.equal(surprise(-150,-100).percent,-50);
 assert.equal(surprise(-100,-100).label,'부합');assert.equal(surprise(10,-100).label,'흑자 전환');
 assert.equal(surprise(-10,100).label,'적자 전환');assert.equal(surprise(10,0).percent,null);
 assert.equal(surprise(null,100).kind,'unknown');assert.equal(surprise(0,0).kind,'equal');
 const mixed=fixture();mixed.metrics={revenue:{actual:7918,forecast:8052},operating:{actual:1962,forecast:1829},net:{actual:898,forecast:1382}};
 assert.equal(earningsVerdict(mixed).kind,'mixed');assert.equal(earningsDecision(mixed,now).kind,'wait');
 const boundary=fixture();boundary.metrics.operating={actual:105,forecast:100};assert.equal(earningsVerdict(boundary).kind,'surprise');
});

test('buy review requires earnings quality, post-announcement entry, fresh data, liquidity and remaining reward',()=>{
 assert.equal(earningsDecision(fixture(),now).kind,'buy');
 for(const change of [
  item=>{item.stale=true;},item=>{item.chart.asOf='2026-11-01';},item=>{item.chart.symbol='999999';},
  item=>{item.chart.asOf='2026-11-16';},item=>{item.chart.signal.asOf='2026-11-01';},item=>{item.chart.signal.provisional=true;},
  item=>{item.chart.signal.entryType='oversoldBounce';},item=>{item.chart.signal.status='closed';},item=>{item.chart.signal.age=6;},
  item=>{item.chart.price=109;},item=>{item.chart.signal.initialStop=80;},item=>{item.chart.rankInputs.mediumAligned=false;},
  item=>{item.chart.liquidity.average=1e9;},item=>{item.name='테스트스팩';},item=>{item.metrics.net.forecast=null;},item=>{item.metrics.revenue.actual=99;}
 ]){const item=fixture();change(item);assert.notEqual(earningsDecision(item,now).kind,'buy');}
});

test('publication validation rejects invalid identities and nonfinite metrics while retaining missing estimates',()=>{
 const data={schemaVersion:1,status:'ok',items:[fixture()]};assert.equal(validEarnings(data),true);
 data.items[0].metrics.net.forecast=null;assert.equal(validEarnings(data),true);
 data.items[0].metrics.net.actual=Infinity;assert.equal(validEarnings(data),false);
 assert.equal(validEarnings({schemaVersion:1,status:'unavailable',items:[]}),true);
 assert.equal(validEarnings({schemaVersion:1,status:'ok',items:[{...fixture(),symbol:'../bad'}]}),false);
 assert.equal(validEarnings({schemaVersion:1,status:'ok',items:[{...fixture(),history:{}}]}),false);
});
