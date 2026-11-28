import{passesLiquidity}from'./screener-core.mjs';
import{passesRankFilters}from'./screener-rank.mjs';
import{applyV2Filters,rankV2,filterSettings,liquidityMode}from'./screener-v2-core.mjs';
export{liquidityMode}from'./screener-v2-core.mjs';

export const FLOW_STAGES=[['liquidity','유동성'],['relative','상대강도'],['volume','거래량'],['riskReward','손익비'],['other','점수·위험']];
export function legacyScope(item,{candidate=false}={}){return item.market==='JP'||candidate;}
export function runFilterFlow(rows,{settings=filterSettings(),contextFor=()=>null,optionsFor=()=>({}),japanLiquidity='standard',japanVolume=0,candidateLiquidity='standard',candidateVolume=0,candidate=false,rankFilters={},collectedAt,now=Date.now()}={}){
 const evaluated=rows.map(item=>{const legacy=legacyScope(item,{candidate}),mode=legacy?(candidate?candidateLiquidity:japanLiquidity):liquidityMode(settings),volume=legacy?(candidate?candidateVolume:japanVolume):settings.commonVolume||0,c=contextFor(item),result=legacy?{pass:true,missing:[],checks:[]}:applyV2Filters(item,c,settings,{...optionsFor(item),now});return{item,result,legacy,mode,volume,context:c};});
 let selected=evaluated;const stages=[],missing=new Map();
 for(const[id,label]of FLOW_STAGES){const before=selected.length;selected=selected.filter(p=>{
  const{item,result,mode,volume}=p,checks=result.checks.filter(c=>c.stage===id);let pass=checks.every(c=>c.pass);
  if(id==='liquidity'){
   if(['standard','strict'].includes(mode))pass=pass&&passesLiquidity(item,mode);
   if(mode!=='all'&&collectedAt)pass=pass&&Date.parse(collectedAt)-Date.parse(item.asOf)<7*86400000;
   // Additional legacy floors belong to this stage, and are disabled by the explicit no-limit choice.
   if(mode!=='all'||p.legacy)pass=pass&&passesRankFilters(item,{turnoverLimits:rankFilters.turnoverLimits});
  }
  if(id==='volume'&&volume>0)pass=pass&&Number.isFinite(item.volumeRatio)&&item.volumeRatio>=volume;
  if(id==='other')pass=pass&&passesRankFilters(item,{minScore:rankFilters.minScore,maxGap:rankFilters.maxGap});
  if(!pass)for(const c of checks)if(!c.pass&&!c.known)missing.set(c.reason,(missing.get(c.reason)||0)+1);
  return pass;
 });stages.push({id,label,before,remaining:selected.length,removed:before-selected.length});}
 return{rows:selected.map(({item,result,legacy,context})=>({...item,v2Context:context,v2Result:result,priority:!legacy&&settings.preset!=='legacy'&&settings.scoreVersion==='v2'?rankV2(item,context,settings):item.priority})),stages,missing};
}
