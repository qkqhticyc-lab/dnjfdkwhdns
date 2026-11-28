import{passesLiquidity}from'./screener-core.mjs';
import{passesRankFilters,rankScreenItem}from'./screener-rank.mjs';
import{applyV2Filters,rankV2,filterSettings,liquidityMode}from'./screener-v2-core.mjs';
export{liquidityMode}from'./screener-v2-core.mjs';

export const FLOW_STAGES=[['liquidity','유동성'],['stockRS','종목 RS'],['sectorStrength','섹터 강도'],['sectorRS','섹터 내 상대강도'],['volume','거래량'],['riskReward','손익비'],['other','점수·위험']];
export function legacyScope(item,{candidate=false}={}){return candidate;}
export function runFilterFlow(rows,{settings=filterSettings(),contextFor=()=>null,optionsFor=()=>({}),candidateLiquidity='standard',candidateVolume=0,candidate=false,rankFilters={},collectedAt,now=Date.now()}={}){
 const evaluated=rows.map(item=>{const legacy=legacyScope(item,{candidate}),mode=legacy?candidateLiquidity:liquidityMode(settings),volume=legacy?candidateVolume:settings.commonVolume||0,c=contextFor(item),result=legacy?{pass:true,missing:[],checks:[]}:applyV2Filters(item,c,settings,{...optionsFor(item),now});return{item,result,legacy,mode,volume,context:c};});
 let selected=evaluated;const stages=[],missing=new Map(),incomparable=new Map();
 for(const[id,label]of FLOW_STAGES){const before=selected.length,diagnostics={unmet:0,missing:0,incomparable:0},volumeStates={pass:0,fail:0,missing:0,incomparable:0};selected=selected.filter(p=>{
  const{item,result,mode,volume}=p,checks=result.checks.filter(c=>c.stage===id),failures=checks.filter(c=>!c.pass),check=(pass,reason,known=true,status)=>{if(!pass)failures.push({reason,known,status});};
  if(id==='liquidity'){
   if(['standard','strict'].includes(mode))check(passesLiquidity(item,mode),'기존 유동성 기준',Number.isFinite(item.liquidity?.average)?Number.isFinite(item.liquidity?.median)&&Number.isFinite(item.liquidity?.activeDays):Number.isFinite(item.listTurnover));
   if(mode!=='all'&&collectedAt)check(Date.parse(collectedAt)-Date.parse(item.asOf)<7*86400000,'최종 봉 갱신 지연',false);
   // Additional legacy floors belong to this stage, and are disabled by the explicit no-limit choice.
   if(mode!=='all'||p.legacy)check(passesRankFilters(item,{turnoverLimits:rankFilters.turnoverLimits}),'추가 평균 거래대금',Number.isFinite(item.liquidity?.average));
  }
  if(id==='volume'){
   if(result.volume)volumeStates[result.volume.status]++;
   if(volume>0){const short=!p.legacy&&item.screenFeatures?.currentVolume?.shortSession;check(!short&&Number.isFinite(item.volumeRatio)&&item.volumeRatio>=volume,'공통 최근봉 상대 거래량',!short&&Number.isFinite(item.volumeRatio),short?'incomparable':null);}
  }
  if(id==='other')check(passesRankFilters(item,{minScore:rankFilters.minScore,maxGap:rankFilters.maxGap}),'기존 V1 점수·이격',!!(item.priority||rankScreenItem(item)));
  const pass=!failures.length;
  if(!pass){diagnostics[failures.some(c=>c.status==='incomparable')?'incomparable':failures.some(c=>!c.known)?'missing':'unmet']++;for(const c of failures){if(c.status==='incomparable')incomparable.set(c.reason,(incomparable.get(c.reason)||0)+1);else if(!c.known)missing.set(c.reason,(missing.get(c.reason)||0)+1);}}
  return pass;
 });stages.push({id,label,before,remaining:selected.length,removed:before-selected.length,diagnostics,...(id==='volume'?{volumeStates,evaluationOnly:settings.typedVolume==='score'&&!candidate}:{})});}
 return{rows:selected.map(({item,result,legacy,context})=>({...item,v2Context:context,v2Result:result,priority:!legacy&&settings.preset!=='legacy'&&settings.scoreVersion==='v2'?rankV2(item,context,settings):item.priority})),stages,missing,incomparable};
}
