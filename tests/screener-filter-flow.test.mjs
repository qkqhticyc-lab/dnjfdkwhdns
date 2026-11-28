import test from'node:test';import assert from'node:assert/strict';
import{runFilterFlow}from'../screener-filter-flow.mjs';
import{filterSettings}from'../screener-v2-core.mjs';
import{filterScreen}from'../screener-core.mjs';
import{unsupportedHistorical,historicalMatch,S}from'../enhanced-study-core.mjs';
const now=Date.parse('2026-11-26T00:00:00Z'),collectedAt=new Date(now).toISOString();
const stock=(symbol,extra={})=>({market:'US',symbol,name:symbol,currency:'USD',status:'ok',state:'active',asOf:'2026-11-25',collectedAt,price:100,volumeRatio:.7,rankInputs:{shortAligned:true,mediumAligned:true},liquidity:{average:1e8,median:5e7,activeDays:20},marketCap:{value:2e10,currency:'USD'},signal:{entryType:'breakout',status:'active',age:0,entry:100,initialStop:95,tp1:110,tp2:120},screenFeatures:{signalVolume:{type:'breakout',ratio:2,regularRatio:2}},locationInputs:{atr:4},...extra});
const contextFor=()=>({rs:{windows:{20:{percentile:90,sectorExcess:5}}},sector:{score:90,state:'leader',percentile:90}});
test('presets use signal volume with no hidden common RVOL or old liquidity floor',()=>{
 const p=stock('LOW-CURRENT'),settings=filterSettings('liquid');assert.equal(runFilterFlow([p],{settings,now,collectedAt}).rows.length,1);
 settings.commonVolume=1;assert.equal(runFilterFlow([p],{settings,now,collectedAt}).stages.find(s=>s.id==='volume').removed,1);
 assert.equal(filterSettings('strict').commonVolume,0);
 const small=stock('SMALL',{liquidity:{average:100,median:50,activeDays:1}});settings.commonVolume=0;settings.liquidityEnabled=false;settings.liquidityMode='all';settings.capEnabled=false;assert.equal(runFilterFlow([small],{settings,now,collectedAt,rankFilters:{turnoverLimits:{US:1e10}}}).rows.length,1);
});
test('waterfall first failure counts sum exactly without counting a stock in several stages',()=>{
 const settings=filterSettings('leadersPrevious'),rows=[stock('LIQ',{marketCap:null,screenFeatures:null}),stock('RS'),stock('VOL',{screenFeatures:null}),stock('RR',{price:111}),stock('SCORE'),stock('PASS')];settings.minScore=50;
 const flow=runFilterFlow(rows,{settings,now,collectedAt,contextFor:p=>p.symbol==='RS'?null:contextFor(),rankFilters:{minScore:0},optionsFor:()=>({latestDate:'2026-11-25'})});
 assert.deepEqual(flow.rows.map(p=>p.symbol),['SCORE','PASS']);assert.deepEqual(flow.stages.map(s=>s.removed),[1,1,0,0,1,1,0]);assert.equal(flow.stages.reduce((n,s)=>n+s.removed,flow.rows.length),rows.length);assert.deepEqual([...flow.missing.keys()],['시가총액','종목 RS','진입 유형별 거래량']);
});
test('legacy basic, strict, fallback and no-limit selections keep old behavior; Japan is isolated in mixed-market scans',()=>{
 const rows=[stock('A',{volumeRatio:2}),stock('B',{volumeRatio:2,liquidity:{average:3e7,median:1.5e7,activeDays:20}}),stock('F',{volumeRatio:2,liquidity:null,listTurnover:9e7}),stock('OLD',{asOf:'2026-10-01'}),stock('JP',{market:'JP',volumeRatio:1.2,liquidity:{average:1.5e9,median:8e8,activeDays:20}})];
 const legacy=runFilterFlow(rows,{settings:filterSettings(),now,collectedAt});const old=filterScreen(rows.filter(p=>now-Date.parse(p.asOf)<7*86400000),{liquidity:'standard'});assert.deepEqual(legacy.rows.map(p=>p.symbol),old.map(p=>p.symbol));
 for(const preset of['liquid','leaders','strict','custom']){const result=runFilterFlow(rows,{settings:filterSettings(preset),now,collectedAt,japanVolume:1});assert.equal(result.rows.filter(p=>p.market==='JP').length,1);assert.equal(runFilterFlow(rows,{settings:filterSettings(preset),now,collectedAt,japanVolume:1.5}).rows.filter(p=>p.market==='JP').length,0);}
 const strict=filterSettings('custom');strict.capEnabled=false;strict.typedVolume='off';strict.riskReview=false;strict.liquidityEnabled=false;strict.liquidityMode='strict';assert.deepEqual(runFilterFlow(rows,{settings:strict,now,collectedAt,japanLiquidity:'strict'}).rows.map(p=>p.symbol),['A','F']);
 strict.liquidityMode='all';assert.ok(runFilterFlow(rows,{settings:strict,now,collectedAt}).rows.some(p=>p.symbol==='OLD'));
 assert.equal(runFilterFlow(rows,{settings:strict,now,collectedAt,japanLiquidity:'all',rankFilters:{turnoverLimits:{JP:2e9}}}).rows.filter(p=>p.market==='JP').length,0);
});
test('candidate bypass and missing-data behavior remain explicit, historical latest-volume is not fabricated',()=>{
 const p=stock('C',{marketCap:null,screenFeatures:null}),settings=filterSettings('strict');assert.equal(runFilterFlow([p],{settings,candidate:true,now,collectedAt}).rows.length,1);
 settings.commonVolume=2;assert.ok(unsupportedHistorical(settings).includes('조회 시점 최근봉 상대 거래량'));
 const custom=filterSettings('custom');custom.capEnabled=false;custom.typedVolume='off';custom.riskReview=false;custom.liquidityMode='strict';custom.liquidityEnabled=false;const record=Array(24).fill(null);record[S.average]=3e7;record[S.median]=1.5e7;assert.equal(historicalMatch(record,'US',custom),null);assert.equal(historicalMatch(record,'US',custom,{supportedOnly:true}),false);
});
