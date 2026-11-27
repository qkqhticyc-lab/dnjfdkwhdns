import{sectorStrengthInputs,sectorStrength}from'./sector-strength-core.mjs';
import{rankScreenItem}from'./screener-rank.mjs';
import{typedVolumeAssessment}from'./screen-feature-inputs.mjs';
export const FILTER_VERSION=2;
export const PRESET_LABELS={legacy:'기존형',liquid:'유동성 우선',leaders:'주도주 우선',strict:'엄격 선별',custom:'사용자 설정'};
export const NEW_LIQUIDITY={KR:{basic:{cap:3e11,average:2e10,median:1e10},strict:{cap:1e12,average:5e10,median:2.5e10}},US:{basic:{cap:2e9,average:5e7,median:2.5e7},strict:{cap:1e10,average:1e8,median:5e7}}};
const positive=v=>Number.isFinite(v)&&v>0;
export const median=a=>{const v=a.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?(v[(v.length-1)>>1]+v[v.length>>1])/2:null;};
export function filterSettings(preset='legacy'){
 const strict=preset==='strict',active=preset!=='legacy';
 return{version:2,preset,scoreVersion:active?'v2':'v1',strict,capEnabled:active,liquidityEnabled:active,limits:structuredClone(Object.fromEntries(Object.entries(NEW_LIQUIDITY).map(([m,x])=>[m,x[strict?'strict':'basic']]))),rsTop:['leaders','strict'].includes(preset)?strict?20:30:0,sectorMode:['leaders','strict'].includes(preset)?'leaders':'all',sectorLeaderStock:['leaders','strict'].includes(preset),typedVolume:active?strict?'strict':'basic':'off',riskReview:active,minTp1R:1,minTp2R:strict?2:1.5,maxUpGap:strict?1:2,maxUpAtr:0,minScore:0,risks:{penny:false,spac:false,halted:false,adr:false,clinical:false,event:false,unknown:false},eventDays:3};
}
export function benchmarkId(p){return p.market==='US'?'SPY':p.market==='KR'?/KOSDAQ|코스닥/i.test(p.group||p.exchange)?'KOSDAQ':/KOSPI|코스피/i.test(p.group||p.exchange)?'KOSPI':null:null;}
export function percentiles(entries,minCount=20){
 const valid=entries.filter(p=>Number.isFinite(p.value)).sort((a,b)=>a.value-b.value),out=new Map();if(valid.length<minCount)return out;
 for(let i=0;i<valid.length;){let end=i+1;while(end<valid.length&&Math.abs(valid[end].value-valid[i].value)<1e-10)end++;const rank=(i+(end-i)/2)/valid.length*100;for(let j=i;j<end;j++)out.set(valid[j].key,rank);i=end;}
 return out;
}
export function rankBenchmarkSnapshot(record,asOf){const points=(record?.points||[]).filter(p=>p.date<=asOf&&p.close>0).map(p=>({asOf:p.date,close:p.close}));return points.at(-1)?.asOf===asOf?sectorStrengthInputs(points):null;}
export function enrichScreenContext(items,classifications,benchmarks={},now=new Date()){
 const byKey=new Map(),sectors=new Map(),dates={};for(const p of items)if(p.status==='ok'&&p.asOf>(dates[p.market]||''))dates[p.market]=p.asOf;
 for(const market of['KR','US']){
  const rows=items.filter(p=>p.market===market&&p.status==='ok'&&p.asOf===dates[market]),benchCache=new Map();
  const bench=p=>{const id=benchmarkId(p);if(!benchCache.has(id))benchCache.set(id,id?rankBenchmarkSnapshot(benchmarks[id],dates[market]):null);return benchCache.get(id);};
  // Broad, valid constituents, never a subset selected by screener controls.
  const sectorBench=rankBenchmarkSnapshot(benchmarks[market==='US'?'SPY':'KOSPI'],dates[market]),strength=sectorStrength(rows,classifications,sectorBench);
  const validGroups=strength.groups.filter(g=>g.count>=5);
  const percentileBy=field=>percentiles(validGroups.map(g=>({key:g.id,value:field(g)})),2);
  const s5=percentileBy(g=>g.relative[5]),s20=percentileBy(g=>g.relative[20]),breadth=percentileBy(g=>g.breadth),liquid=percentileBy(g=>g.turnoverRatio),signals=percentileBy(g=>g.signalRate);
  for(const g of strength.groups){const known=g.count>=5&&s5.has(g.id)&&s20.has(g.id);const score=known?(s5.get(g.id)*.3+s20.get(g.id)*.3+(breadth.get(g.id)||0)*.2+(liquid.get(g.id)||0)*.1+(signals.get(g.id)||0)*.1):null;sectors.set(market+':'+g.id,{...g,score,state:known?g.state==='watch'?'weak':g.state:'unknown',percentile:null});}
  const sr=percentiles([...sectors.entries()].filter(([k,g])=>k.startsWith(market+':')&&Number.isFinite(g.score)).map(([key,g])=>({key,value:g.score})),2);for(const[k,rank]of sr)sectors.get(k).percentile=rank;
  for(const p of rows){const key=p.market+':'+p.symbol,b=bench(p),windows=p.sectorStrength?.windows,classified=classifications.get(key),g=sectors.get(market+':'+classified?.id),rs={benchmark:benchmarkId(p),asOf:p.asOf,windows:{}};
   for(const h of[5,20,60]){const v=windows?.[h],ref=b?.windows?.[h],known=p.sectorStrength?.asOf===p.asOf&&b?.asOf===p.asOf&&Number.isFinite(v?.return)&&Number.isFinite(ref?.return)&&v.from===ref.from;rs.windows[h]={from:known?v.from:null,absolute:known?v.return:null,excess:known?v.return-ref.return:null,percentile:null,sectorExcess:known&&Number.isFinite(g?.returns[h])?v.return-g.returns[h]:null};}
   byKey.set(key,{rs,sector:g||{id:classified?.id,state:'unknown',score:null,percentile:null},laggard:rs.windows[20].sectorExcess<0});
  }
  for(const h of[5,20,60]){const ranks=percentiles(rows.map(p=>({key:p.market+':'+p.symbol,value:byKey.get(p.market+':'+p.symbol).rs.windows[h].excess})));for(const[key,rank]of ranks)byKey.get(key).rs.windows[h].percentile=rank;}
 }
 return{version:2,dates,byKey,sectors};
}
export function entryReview(item,settings=filterSettings('liquid'),{entry=item.price,quantity=0,latestDate,now=Date.now(),basis='closed'}={}){
 const s=item.signal,reasons=[],stop=s?.initialStop,tp1=s?.tp1,tp2=s?.tp2,atr=item.locationInputs?.atr,known=[entry,stop,tp1,tp2,s?.entry].every(positive)&&tp2>=tp1;
 const stale=item.status!=='ok'||!item.asOf||latestDate&&item.asOf<latestDate||Number.isFinite(Date.parse(item.collectedAt))&&now-Date.parse(item.collectedAt)>72*3600000;
 if(stale)reasons.push('시세 자료 부족 또는 갱신 지연');if(!known)reasons.push('진입가·초기 손절·목표 자료 부족');
 if(!s||s.status!=='active'||s.provisional)reasons.push('활성 확정 진입 신호 아님');
 const risk=known?entry-stop:null,gapPct=known?(entry/s.entry-1)*100:null,gapAtr=known&&positive(atr)?(entry-s.entry)/atr:null;
 const lossPct=known?risk/entry*100:null,tp1Pct=known?(tp1-entry)/entry*100:null,tp2Pct=known?(tp2-entry)/entry*100:null,tp1R=known&&risk>0?(tp1-entry)/risk:null,tp2R=known&&risk>0?(tp2-entry)/risk:null;
 if(known&&entry<=stop)reasons.push('초기 손절선 이탈');if(known&&(entry>=tp1||s.tp1Hit||s.tp2Hit))reasons.push('이미 TP1 도달 또는 초과');
 if(known&&risk>0&&(tp1R<settings.minTp1R||tp2R<settings.minTp2R))reasons.push('현재 진입가 손익비 기준 미충족');
 if(known&&gapPct>settings.maxUpGap)reasons.push('과도한 상방 이격');if(settings.maxUpAtr>0){if(!positive(atr))reasons.push('ATR 자료 부족');else if(gapAtr>settings.maxUpAtr)reasons.push('ATR 상방 이격 초과');}
 return{basis,entry,stop,tp1,tp2,atr,lossPct,tp1Pct,tp2Pct,tp1R,tp2R,gapPct,gapAtr,quantity,plannedLoss:known&&risk>0&&quantity>0?risk*quantity:null,known,stale,status:reasons.length?'hold':'review',label:reasons.length?'진입 보류':basis==='manual'?'입력가 기준 조건 충족':'마감 기준 조건 충족',reasons};
}
export function rankV2(item,context,settings=filterSettings('liquid')){
 if(item.market==='JP')return null;const s=item.signal;if(item.status!=='ok'||s?.status!=='active'||!positive(s.entry)||!positive(item.price))return null;
 const gap=(item.price/s.entry-1)*100,a=item.rankInputs,rs=context?.rs?.windows[20]?.percentile,sector=context?.sector,volume=typedVolumeAssessment(item.screenFeatures?.signalVolume,settings.typedVolume==='strict'),strictVolume=typedVolumeAssessment(item.screenFeatures?.signalVolume,true),base=NEW_LIQUIDITY[item.market]?.basic.average,turnover=base&&positive(item.liquidity?.average)?item.liquidity.average/base:null;
 const components=[
  {label:'진입가 이격',max:20,known:true,points:Math.abs(gap)<=1?20:Math.abs(gap)<=2?16:Math.abs(gap)<=3?10:Math.abs(gap)<=5?4:0,detail:gap.toFixed(2)+'%'},
  {label:'신호 최근성',max:10,known:Number.isFinite(s.age),points:s.age===0?10:s.age<=2?8:s.age<=4?6:s.age<=9?3:0,detail:Number.isFinite(s.age)?s.age+'봉 전':'자료 부족'},
  {label:'추세 정렬',max:15,known:typeof a?.shortAligned==='boolean'&&typeof a?.mediumAligned==='boolean',points:(a?.shortAligned?10:0)+(a?.mediumAligned?5:0),detail:'단기 10점 · 중기 5점'},
  {label:'거래대금',max:10,known:turnover!==null,points:turnover>=5?10:turnover>=2?8:turnover>=1?6:0,detail:turnover===null?'자료 부족':'기본형 하한의 '+turnover.toFixed(2)+'배'},
  {label:'유형별 신호봉 거래량',max:15,known:volume.known,points:volume.pass?strictVolume.pass?15:12:0,detail:volume.reason},
  {label:'종목 RS',max:20,known:Number.isFinite(rs),points:Number.isFinite(rs)?Math.floor(rs*.2*10)/10:0,detail:Number.isFinite(rs)?'20일 RS '+rs.toFixed(1)+'백분위':'동일 기간 시장 비교 자료 부족'},
  {label:'섹터 상대강도',max:10,known:Number.isFinite(sector?.score),points:Number.isFinite(sector?.score)?Math.floor(sector.score)/10:0,detail:Number.isFinite(sector?.score)?'전체 구성 종목 기반 강도 '+sector.score.toFixed(1):'섹터 자료 부족'},
 ].map(c=>({...c,points:c.known?c.points:0}));
 return{version:2,score:Math.round(components.reduce((s,c)=>s+c.points,0)*10)/10,knownMax:components.filter(c=>c.known).reduce((s,c)=>s+c.max,0),components,gapPct:gap,v1:rankScreenItem(item)?.score??null};
}
export function riskFacts(item,sector,earnings,settings,now=Date.now()){
 const name=item.name||'',record=(earnings?.items||[]).find(e=>e.market===item.market&&e.symbol===item.symbol&&!e.stale),date=new Date(now).toISOString().slice(0,10),events=[record?.announcedOn,record?.upcoming?.announcedOn].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))),window=settings.eventDays*86400000;
 const event=events.length?events.some(d=>Math.abs(Date.parse(d)-Date.parse(date))<=window):null;
 return{penny:item.market==='US'&&Number.isFinite(item.price)?item.price<5:false,spac:/스팩|기업인수목적|\bSPAC\b/i.test(name)?true:null,halted:item.listingRisk?.tradable===false?true:item.listingRisk?.tradable===true&&Number.isFinite(item.liquidity?.activeDays)?item.liquidity.activeDays<15:null,adr:/\bADR\b|예탁증서|American Depositary/i.test(name)?true:null,clinical:typeof item.riskClassification?.clinicalDependent==='boolean'?item.riskClassification.clinicalDependent:null,clinicalIndustry:/바이오|생명공학|biotech/i.test(sector?.industry||''),event,eventDates:events};
}
export function applyV2Filters(item,context,settings,{latestDate,earnings,sector,now=Date.now()}={}){
 if(settings.preset==='legacy'||item.market==='JP')return{pass:true,reasons:[],missing:[]};const reasons=[],missing=[],limits=settings.limits[item.market],require=(ok,reason,known=true)=>{if(!ok){reasons.push(reason);if(!known)missing.push(reason);}};
 if(settings.liquidityEnabled){require(Number.isFinite(item.liquidity?.average)&&item.liquidity.average>=limits.average,'평균 거래대금',Number.isFinite(item.liquidity?.average));require(Number.isFinite(item.liquidity?.median)&&item.liquidity.median>=limits.median,'거래대금 중앙값',Number.isFinite(item.liquidity?.median));}
 if(settings.capEnabled)require(positive(item.marketCap?.value)&&item.marketCap.currency===item.currency&&item.marketCap.value>=limits.cap,'시가총액',positive(item.marketCap?.value)&&item.marketCap.currency===item.currency);
 if(settings.rsTop>0)require(Number.isFinite(context?.rs?.windows[20]?.percentile)&&context.rs.windows[20].percentile>=100-settings.rsTop,'종목 RS',Number.isFinite(context?.rs?.windows[20]?.percentile));
 if(settings.sectorMode!=='all'){const g=context?.sector;require(settings.sectorMode==='leaders'?['leader','improving'].includes(g?.state):Number.isFinite(g?.percentile)&&g.percentile>=100-Number(settings.sectorMode),'섹터 강도',Number.isFinite(g?.score));}
 if(settings.sectorLeaderStock)require(Number.isFinite(context?.rs?.windows[20]?.sectorExcess)&&context.rs.windows[20].sectorExcess>=0,'섹터 내 소외 종목',Number.isFinite(context?.rs?.windows[20]?.sectorExcess));
 if(settings.typedVolume!=='off'){const v=typedVolumeAssessment(item.screenFeatures?.signalVolume,settings.typedVolume==='strict');require(v.pass,'진입 유형별 거래량',v.known);}
 const rank=rankV2(item,context,settings);if(settings.minScore>0){const chosen=settings.scoreVersion==='v1'?rankScreenItem(item):rank;require(chosen?.score>=settings.minScore,settings.scoreVersion.toUpperCase()+' 점수',!!chosen);}
 const review=entryReview(item,settings,{latestDate,now});if(settings.riskReview)require(review.status==='review','현재 손익비·진입 부담',review.known&&!review.stale);
 const risk=riskFacts(item,sector,earnings,settings,now);for(const key of['penny','spac','halted','adr','clinical','event'])if(settings.risks[key])require(risk[key]!==true&&(!settings.risks.unknown||risk[key]!==null),'특수 위험 '+key,risk[key]!==null);
 return{pass:!reasons.length,reasons,missing,rank,review,risk};
}
