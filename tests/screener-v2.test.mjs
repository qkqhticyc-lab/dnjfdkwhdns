import test from'node:test';import assert from'node:assert/strict';
import{filterSettings,entryReview,rankV2,applyV2Filters,percentiles,enrichScreenContext,riskFacts}from'../screener-v2-core.mjs';
import{volumeSnapshot,signalVolumeInputs,typedVolumeAssessment,listingFacts,screenClosedRows}from'../screen-feature-inputs.mjs';
import{buildEnhancedStudy,summarizeEnhanced,S,unsupportedHistorical}from'../enhanced-study-core.mjs';
import{parseKoreanProfile,collectStockProfile}from'../stock-profile-core.mjs';
const stock=(extra={})=>({market:'US',symbol:'TEST',currency:'USD',group:'NASDAQ',name:'Test',status:'ok',asOf:'2026-11-25',collectedAt:'2026-11-25T22:00:00Z',price:100,rankInputs:{shortAligned:true,mediumAligned:true},liquidity:{average:1e8,median:5e7,activeDays:20,last:1e8},marketCap:{value:5e9,currency:'USD'},signal:{status:'active',age:0,entry:100,initialStop:95,tp1:110,tp2:120},locationInputs:{atr:4},screenFeatures:{signalVolume:{type:'breakout',ratio:2,regularRatio:2}},...extra});
const now=Date.parse('2026-11-26T00:00:00Z');
test('legacy keeps its selection and Japan now uses explicit preset conditions; missing cap and median are never estimated',()=>{
 const p=stock({marketCap:null,liquidity:{average:1e10}});assert.equal(applyV2Filters(p,null,filterSettings(),{now}).pass,true);assert.equal(applyV2Filters({...p,market:'JP'},null,filterSettings('strict'),{now}).pass,false);
 const r=applyV2Filters(p,null,filterSettings('liquid'),{now});assert.ok(r.missing.includes('시가총액'));assert.ok(r.missing.includes('거래대금 중앙값'));
 assert.equal(listingFacts({marketValue:'999999999',marketValueRaw:null},'US').marketCap,null);
 assert.equal(listingFacts({marketValueRaw:'2,500,000,000',localTradedAt:'date'},'US').marketCap.value,2.5e9);
});
test('a liquidity spike cannot replace persistent median liquidity and cap can be disabled separately',()=>{
 const p=stock({marketCap:null,liquidity:{average:2e8,median:1e6,activeDays:20}}),settings=filterSettings('liquid');settings.riskReview=false;settings.typedVolume='off';settings.capEnabled=false;
 const r=applyV2Filters(p,null,settings,{now});assert.deepEqual(r.reasons,['거래대금 중앙값']);settings.liquidityEnabled=false;assert.equal(applyV2Filters(p,null,settings,{now}).pass,true);
});
test('actual entry R and planned loss use the input price, not the historical signal price',()=>{
 const p=stock(),settings=filterSettings('liquid');let r=entryReview(p,settings,{entry:102,quantity:100,now});assert.equal(r.lossPct,7/102*100);assert.equal(r.tp1R,8/7);assert.equal(r.tp2R,18/7);assert.equal(r.plannedLoss,700);
 r=entryReview(p,settings,{entry:103,now});assert.equal(r.status,'hold');assert.ok(r.reasons.includes('과도한 상방 이격'));assert.equal(entryReview(p,settings,{entry:94,now}).tp1R,null);
 p.signal.tp1Hit=true;assert.ok(entryReview(p,settings,{entry:100,now}).reasons.includes('이미 TP1 도달 또는 초과'));
 assert.equal(entryReview(stock({asOf:'2026-11-24'}),settings,{latestDate:'2026-11-25',now}).status,'hold');
});
test('V2 never awards points for missing RS/sector/trend data or rescales the remainder',()=>{
 const p=stock({rankInputs:null,screenFeatures:null}),r=rankV2(p,null);assert.equal(r.knownMax,40);assert.ok(r.components.filter(c=>!c.known).every(c=>c.points===0));assert.ok(r.score<=40);
 const q=rankV2(stock(),{rs:{windows:{20:{percentile:99}}},sector:{score:100}});assert.equal(q.components.reduce((s,c)=>s+c.max,0),100);assert.ok(q.score<=100);
});
test('signal RVOL uses only previous completed bars, survives later spikes, and separates early closes',()=>{
 const rows=Array.from({length:30},(_,i)=>({date:new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10),asOf:new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10),volume:i===25?200:100,open:100,close:101}));
 const before=volumeSnapshot(rows,25,'US');assert.equal(before.ratio,2);rows[26].volume=100000;assert.deepEqual(volumeSnapshot(rows,25,'US'),before);assert.equal(volumeSnapshot(rows,26,'US').ratio,100000/105);
 rows[25].asOf='2026-11-27';const short=volumeSnapshot(rows,25,'US');assert.equal(short.shortSession,true);assert.equal(short.regularRatio,null);assert.equal(volumeSnapshot([...rows,{...rows[25],extended:true}],rows.length,'US').ratio,null);assert.equal(typedVolumeAssessment({...short,type:'breakout'}).known,false);
});
test('pullback contraction and box retest selling volume are independent of breakout rules',()=>{
 const rows=Array.from({length:30},(_,i)=>({asOf:'2026-10-'+String(i+1).padStart(2,'0'),volume:i>=22&&i<25?30:100,open:100,close:i>=22&&i<25?99:101}));rows[25].volume=130;
 const p=signalVolumeInputs(rows,rows.map(()=>({})),25,'pullback','KR');assert.equal(p.contraction,true);assert.equal(typedVolumeAssessment(p).pass,true);
 assert.equal(typedVolumeAssessment({...p,type:'breakout'}).pass,false);
 const frames=rows.map(()=>({}));frames[25].pattern={box:{breakout:21}};const box=signalVolumeInputs(rows,frames,25,'boxRetest','KR');assert.equal(box.sellContraction,true);assert.equal(box.recoveryIncrease,true);assert.equal(typedVolumeAssessment(box).pass,true);
});
test('RS uses full latest-date peers, midpoint ties, exchange-specific benchmarks and aligned start dates',()=>{
 assert.equal(percentiles([{key:'one',value:5}]).size,0);assert.equal(percentiles(Array.from({length:20},(_,i)=>({key:i,value:1}))).get(0),50);
 const points=Array.from({length:70},(_,i)=>({date:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10),close:100+i})),asOf=points.at(-1).date;
 const rows=Array.from({length:40},(_,i)=>stock({symbol:'R'+i,asOf,group:i<20?'KOSPI':'KOSDAQ',market:'KR',sectorStrength:{version:1,asOf,above20:true,windows:Object.fromEntries([5,20,60].map(h=>[h,{from:points.at(-h-1).date,return:i+20}]))}}));
 const benchmark={KOSPI:{points},KOSDAQ:{points:points.map(p=>({...p,close:p.close*2}))}};
 let result=enrichScreenContext(rows,new Map(rows.map(p=>['KR:'+p.symbol,{id:'technology'}])),benchmark,new Date('2026-12-01T00:00Z'));assert.equal(result.byKey.get('KR:R1').rs.benchmark,'KOSPI');assert.equal(result.byKey.get('KR:R21').rs.benchmark,'KOSDAQ');assert.ok(result.byKey.get('KR:R39').rs.windows[20].percentile>95);assert.equal(result.sectors.get('KR:technology').count,40);
 rows[39].sectorStrength.windows[20].from='2026-01-01';result=enrichScreenContext(rows,new Map(),benchmark,new Date('2026-12-01T00:00Z'));assert.equal(result.byKey.get('KR:R39').rs.windows[20].percentile,null);
});
test('clinical dependency and uncollected earnings are unknown, never inferred from healthcare membership',()=>{
 const r=riskFacts(stock(),{industry:'생명공학'},null,filterSettings('liquid'),now);assert.equal(r.clinical,null);assert.equal(r.event,null);assert.equal(r.clinicalIndustry,true);assert.equal(riskFacts(stock({name:'Company ADR'}),null,null,filterSettings(),now).adr,true);
});
function studyFixture(){const rows=Array.from({length:50},(_,i)=>({asOf:new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10),open:100,high:103,low:98,close:101,volume:100})),frames=rows.map(p=>({...p,atr:3,ema8:100,ema14:99,ema21:98,ema55:97,volumeRatio:1,trade:{initialStop:95,tp1:110,tp2:120}})),guide={frames,events:[{key:'breakoutEntry',asOf:rows[25].asOf}]};return{rows,guide};}
test('historical filters cannot use present capitalization, market percentiles or sector classifications as past strength',()=>{
 const{rows,guide}=studyFixture(),records=buildEnhancedStudy(stock(),rows,guide);assert.equal(records.length,1);const settings=filterSettings('leaders');assert.ok(unsupportedHistorical(settings).length>=3);const input=records.map(record=>({market:'US',symbol:'TEST',record}));assert.equal(summarizeEnhanced(input,{settings}).unknown,1);assert.equal(summarizeEnhanced(input,{settings}).count,0);
 const before=records[0].slice(0,S.paths);rows[49].volume=1e9;assert.deepEqual(buildEnhancedStudy(stock(),rows,guide)[0].slice(0,S.paths),before);
});
test('next-open R, entry gaps, gap-stop losses and TP1-before-stop remain chronological after costs',()=>{
 const{rows,guide}=studyFixture();rows[26].open=102;rows[27].high=112;rows[28].open=90;rows[28].low=89;
 const record=buildEnhancedStudy(stock(),rows,guide)[0];assert.equal(record[S.tp1R],8/7);const r=summarizeEnhanced([{market:'US',symbol:'TEST',record}],{});assert.equal(r.count,1);assert.ok(r.mean<-11);assert.equal(r.tp1Rate,100);assert.equal(r.stopRate,0);assert.ok(r.expectancyR<0);assert.equal(r.profitFactor,0);
 rows[26].open=94;const down=summarizeEnhanced(buildEnhancedStudy(stock(),rows,guide).map(record=>({market:'US',symbol:'TEST',record})),{});assert.equal(down.gapDown,1);assert.equal(down.count,0);assert.ok(down.maxEntryGapLoss<0);
});
test('profile parsing rejects other identities and unsafe external fetch parameters',async()=>{
 const html='<h5 class="bg7">기업개요</h5>[기준:2026.01.01]<li data-cd="005930">실제 사업 설명</li><h5 class="bg8">';assert.equal(parseKoreanProfile(html,'005930').summary,'실제 사업 설명');assert.throws(()=>parseKoreanProfile(html,'000660'),/identity/);await assert.rejects(()=>collectStockProfile({market:'US',symbol:'A',provider:'https://private/path'}),/Invalid/);
});

test('early close is a completed screener bar only after 13 ET, while normal days stay unfinished',()=>{const rows=[{asOf:'2026-11-27',provisional:true}];assert.equal(screenClosedRows(rows,'US',new Date('2026-11-27T17:59:00Z')).length,0);assert.equal(screenClosedRows(rows,'US',new Date('2026-11-27T18:01:00Z'))[0].provisional,false);assert.equal(screenClosedRows([{asOf:'2026-11-25',provisional:true}],'US',new Date('2026-11-25T18:01:00Z')).length,0);});
