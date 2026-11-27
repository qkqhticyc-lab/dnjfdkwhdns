import{ENTRY_KEYS,entryTrigger}from'./entry-types.mjs';
import{evaluateStudyPath,netStudyReturn,STUDY_COSTS}from'./signal-study-core.mjs';
import{signalVolumeInputs,typedVolumeAssessment}from'./screen-feature-inputs.mjs';
import{rankScreenItem,rankInputs}from'./screener-rank.mjs';
import{benchmarkId,entryReview,filterSettings,median,rankV2}from'./screener-v2-core.mjs';
export const ENHANCED_STUDY_VERSION=1;
export const STUDY_FIELDS=['date','type','regime','signalPrice','open','stop','tp1','tp2','atr','average','median','signalRvol','volumeKnown','volumePass','strictKnown','strictPass','v1','partialV2','marketExcess20','gapPct','gapAtr','tp1R','tp2R','paths'];
export const S=Object.fromEntries(STUDY_FIELDS.map((key,index)=>[key,index]));
export function buildEnhancedStudy(item,rows,guide,{benchmarks={},regimeAt=()=> 'unknown'}={}){
 if(!['KR','US'].includes(item.market))return[];
 const indexes=new Map(rows.map((p,i)=>[p.asOf,i])),output=[],benchmark=benchmarks[benchmarkId(item)],bench=new Map((benchmark?.points||[]).map(p=>[p.date,p.close]));
 for(const event of guide.events){
  if(!ENTRY_KEYS.includes(event.key)||event.provisional)continue;const i=indexes.get(event.asOf);if(i===undefined)continue;
  const f=guide.frames[i],type=entryTrigger(guide.frames,i,event.key).type,levels=event.levels||f.trade;if(type==='unknown'||![levels?.initialStop,levels?.tp1,levels?.tp2].every(v=>v>0))continue;
  const future=rows.slice(i+1,i+21),open=future[0]?.open??null,prior=rows.slice(Math.max(0,i-19),i+1),values=prior.map(p=>p.close*p.volume).filter(Number.isFinite),sorted=[...values].sort((a,b)=>a-b),average=values.length===20?values.reduce((s,v)=>s+v,0)/20:null,med=sorted.length===20?(sorted[9]+sorted[10])/2:null;
  const volume=signalVolumeInputs(rows,guide.frames,i,type,item.market),v=typedVolumeAssessment(volume),strict=typedVolumeAssessment(volume,true),p={market:item.market,status:'ok',asOf:f.asOf,collectedAt:f.asOf+'T23:59:00Z',price:f.close,rsi:f.rsi,rankInputs:rankInputs(f),liquidity:{average,median:med},volumeRatio:f.volumeRatio,locationInputs:{atr:f.atr},screenFeatures:{signalVolume:volume},signal:{status:'active',entry:f.close,initialStop:levels.initialStop,tp1:levels.tp1,tp2:levels.tp2,age:0}};
  const review=open?entryReview(p,filterSettings('liquid'),{entry:open,now:Date.parse(f.asOf+'T23:59:00Z')}):null;
  const base=rows[i-20],excess=base&&bench.get(base.asOf)>0&&bench.get(f.asOf)>0?(f.close/base.close-1)*100-(bench.get(f.asOf)/bench.get(base.asOf)-1)*100:null;
  const paths=[5,10,20].map(h=>{if(!(open>levels.initialStop&&open<levels.tp1))return null;const result=evaluateStudyPath(future,{stop:levels.initialStop,tp1:levels.tp1,tp2:levels.tp2},h,type==='oversoldBounce'?8:type==='supportBounce'?12:20);return result?[result.ratio,result.mae,Number(result.tp1),Number(result.tp2),Number(result.stopBeforeTp1),Number(result.ambiguous)]:null;});
  output.push([f.asOf,type,regimeAt(f.asOf),f.close,open,levels.initialStop,levels.tp1,levels.tp2,f.atr,average,med,volume.ratio,Number(v.known),Number(v.pass),Number(strict.known),Number(strict.pass),rankScreenItem(p)?.score??null,rankV2(p,null)?.score??null,excess,review?.gapPct??null,review?.gapAtr??null,review?.tp1R??null,review?.tp2R??null,paths]);
 }
 return output;
}
export function unsupportedHistorical(settings){
 const missing=[];if(settings.capEnabled)missing.push('발생 당시 시가총액');if(settings.rsTop>0)missing.push('당시 전체 시장 RS 백분위');if(settings.sectorMode!=='all'||settings.sectorLeaderStock)missing.push('당시 전체 구성 종목의 섹터 강도');if(settings.minScore>0&&settings.scoreVersion==='v2')missing.push('완전한 V2 점수');for(const k of['adr','spac','halted','clinical','event'])if(settings.risks[k])missing.push('당시 '+({adr:'ADR',spac:'SPAC',halted:'거래정지',clinical:'임상',event:'이벤트'})[k]+' 분류');return missing;
}
export function historicalMatch(r,market,settings,{supportedOnly=false}={}){
 if(settings.preset==='legacy')return true;if(!supportedOnly&&unsupportedHistorical(settings).length)return null;
 const floor=settings.limits[market];if(settings.liquidityEnabled&&(!(r[S.average]>=floor.average)||!(r[S.median]>=floor.median)))return false;
 if(settings.typedVolume!=='off'){const strict=settings.typedVolume==='strict';if(!r[strict?S.strictKnown:S.volumeKnown])return null;if(!r[strict?S.strictPass:S.volumePass])return false;}
 if(settings.minScore>0&&settings.scoreVersion==='v1'&&!(r[S.v1]>=settings.minScore))return false;
 if(settings.risks.penny&&market==='US'&&r[S.open]<5)return false;
 if(settings.riskReview&&(!(r[S.tp1R]>=settings.minTp1R)||!(r[S.tp2R]>=settings.minTp2R)||r[S.gapPct]>settings.maxUpGap||settings.maxUpAtr>0&&(!Number.isFinite(r[S.gapAtr])||r[S.gapAtr]>settings.maxUpAtr)))return false;
 return true;
}
export function summarizeEnhanced(records,{market='ALL',settings=filterSettings(),supportedOnly=false,horizon=20,costIndex=1,from='',to='',type='',regime='',phase='all',cutoff='',sector='',classification=new Map(),volumeMin=0,volumeMax=0,turnoverMin=0,turnoverLimits={},gapMin=null,gapMax=null,v1Min=0}={}){
 let signals=0,possible=0,pending=0,unknown=0,gapDown=0,gapUp=0,maxEntryGapLoss=null,tp1=0,tp2=0,stop=0,ambiguous=0;const returns=[],rValues=[],maes=[];
 for(const{market:m,symbol,record:r}of records){const date=r[S.date];if(market!=='ALL'&&m!==market||from&&date.slice(0,7)<from||to&&date.slice(0,7)>to||type&&r[S.type]!==type||regime&&r[S.regime]!==regime||phase==='explore'&&date>=cutoff||phase==='validate'&&date<cutoff||sector&&classification.get(m+':'+symbol)!==sector)continue;
  if(turnoverLimits[m]>0&&!(r[S.average]>=turnoverLimits[m]))continue;
  if(volumeMin>0&&!(r[S.signalRvol]>=volumeMin)||volumeMax>0&&!(r[S.signalRvol]<volumeMax)||turnoverMin>0&&!(r[S.average]>=turnoverMin)||v1Min>0&&!(r[S.v1]>=v1Min)||gapMin!==null&&!(r[S.gapPct]>=gapMin)||gapMax!==null&&!(r[S.gapPct]<=gapMax))continue;
  signals++;const match=historicalMatch(r,m,settings,{supportedOnly});if(match===null){unknown++;continue;}if(!match)continue;
  if(!(r[S.open]>0)){pending++;continue;}
  if(r[S.open]<=r[S.stop]){gapDown++;const gap=(r[S.open]/r[S.signalPrice]-1)*100;maxEntryGapLoss=maxEntryGapLoss===null?gap:Math.min(gap,maxEntryGapLoss);continue;}if(r[S.open]>=r[S.tp1]){gapUp++;continue;}possible++;
  const path=r[S.paths][[5,10,20].indexOf(Number(horizon))];if(!path){pending++;continue;}
  const value=netStudyReturn(path[0],STUDY_COSTS[costIndex]),risk=(r[S.open]-r[S.stop])/r[S.open]*100;returns.push(value);rValues.push(value/risk);maes.push(path[1]);tp1+=path[2];tp2+=path[3];stop+=path[4];ambiguous+=path[5];
 }
 const count=returns.length,winners=returns.filter(v=>v>0),losers=returns.filter(v=>v<0),sum=a=>a.reduce((s,v)=>s+v,0),avg=a=>a.length?sum(a)/a.length:null,gain=sum(winners),loss=-sum(losers);
 return{signals,possible,pending,unknown,gapDown,gapUp,maxEntryGapLoss,count,winRate:count?winners.length/count*100:null,mean:avg(returns),median:median(returns),meanWin:avg(winners),meanLoss:avg(losers),payoffRatio:losers.length&&winners.length?avg(winners)/-avg(losers):null,expectancyR:avg(rValues),profitFactor:loss>0?gain/loss:null,noLoss:count>0&&!losers.length,tp1Rate:count?tp1/count*100:null,tp2Rate:count?tp2/count*100:null,stopRate:count?stop/count*100:null,meanMae:avg(maes),worstMae:maes.length?Math.min(...maes):null,ambiguous};
}
