// A fresh planning snapshot, not a simulated fill or the legacy signal trade.
// Every input must belong to the displayed prefix. Parameters are our own rules.
export const PLAN_RULES = '최근 60봉에서 좌우 2개 마감봉으로 확인한 고점·저점을 사용합니다. 최근 5봉 안에 종가로 넘은 고점 또는 이탈하지 않은 저점 중 가까운 지지를 선택합니다. 없으면 EMA21을 참고선으로 사용합니다. 손절 후보는 기준선−0.25ATR이며 현재가에서 최소 0.75ATR 거리를 둡니다. 목표 후보는 현재가 위의 가까운 확인 고점 순서입니다. 저항이 없으면 1ATR·2ATR 상승 시나리오만 표시합니다. 손절폭 기본 한도 8%, 1차 손익비 1.5 미만 또는 EMA21 위 2ATR 초과면 진입 대기입니다. 이는 자체 선택한 검토 기준이며 최적화·수익 검증된 수치가 아닙니다.';
const finite = Number.isFinite;
export function buildTradePlan(frames, {maxRiskPct=8}={}) {
 const p=frames.at(-1),entry=p?.close,atr=p?.atr;
 const empty={status:'unavailable',label:'자료 부족',asOf:p?.asOf,entry,stop:null,tp1:null,tp2:null,reasons:['가격·ATR 및 충분한 마감봉이 필요합니다.']};
 if(!finite(entry)||entry<=0||!finite(atr)||atr<=0||frames.length<22)return empty;
 maxRiskPct=[5,8,12].includes(maxRiskPct)?maxRiskPct:8;
 const closed=frames.filter(v=>!v.provisional),peaks=[],troughs=[];
 for(let i=Math.max(2,closed.length-60);i<closed.length-2;i++) {
  const b=closed[i],neighbors=[closed[i-2],closed[i-1],closed[i+1],closed[i+2]];
  if(![b,...neighbors].every(v=>finite(v.high)&&finite(v.low)))continue;
  if(neighbors.every(v=>b.high>=v.high)&&neighbors.some(v=>b.high>v.high))peaks.push({value:b.high,asOf:b.asOf,index:i});
  if(neighbors.every(v=>b.low<=v.low)&&neighbors.some(v=>b.low<v.low))troughs.push({value:b.low,asOf:b.asOf,index:i});
 }
 const supports=[];
 for(const h of peaks)if(h.value<entry&&frames.slice(-5).some((b,j,a)=>{
  const prev=j?a[j-1]:frames.at(-6);return prev&&prev.asOf>h.asOf&&prev.close<=h.value&&b.close>h.value;
 }))supports.push({...h,kind:'최근 돌파 고점'});
 for(const l of troughs)if(l.value<entry&&closed.slice(l.index+2).every(b=>b.close>=l.value-atr*.25))supports.push({...l,kind:'확인된 눌림 저점'});
 // Recent 20-bar resistance is also useful before a 2-right-bar pivot exists.
 const recent=frames.slice(-21,-1).filter(v=>!v.provisional&&finite(v.high));
 if(recent.length===20){const high=Math.max(...recent.map(v=>v.high));if(entry>high)supports.push({value:high,asOf:recent.find(v=>v.high===high).asOf,kind:'직전 20봉 돌파선'});}
 supports.sort((a,b)=>b.value-a.value);
 const support=supports[0]||(finite(p.ema21)&&p.ema21<entry?{value:p.ema21,asOf:p.asOf,kind:'EMA21 참고선'}:null);
 if(!support)return {...empty,reasons:['현재가 아래에서 사용할 지지 기준을 확인하지 못했습니다.']};
 const stop=Math.min(support.value-atr*.25,entry-atr*.75);
 if(stop<=0)return {...empty,reasons:['변동성이 가격에 비해 너무 커 유효한 손절 후보를 계산할 수 없습니다.']};
 const risk=entry-stop,riskPct=risk/entry*100,targets=[];
 for(const h of peaks.filter(h=>h.value>entry).sort((a,b)=>a.value-b.value))if(!targets.some(t=>Math.abs(t.value-h.value)<atr*.25))targets.push({...h,kind:'확인 고점 저항'});
 // Never skip a nearby resistance merely to manufacture a better reward/risk.
 const first=targets[0]||{value:entry+atr,kind:'저항 미확인 · 1ATR 시나리오'},second=targets[1]||(targets[0]?null:{value:entry+2*atr,kind:'저항 미확인 · 2ATR 시나리오'});
 const rr=(first.value-entry)/risk,extended=finite(p.ema21)&&entry-p.ema21>2*atr,reasons=[];
 if(riskPct>maxRiskPct)reasons.push(`손절폭 ${riskPct.toFixed(1)}%가 선택 한도 ${maxRiskPct}%를 넘습니다.`);
 if(rr<1.5)reasons.push(`1차 후보까지 손익비 ${rr.toFixed(2)}로 기준 1.5에 못 미칩니다.`);
 if(extended)reasons.push('EMA21에서 2ATR 이상 벌어져 있습니다.');
 if(!targets.length)reasons.push('위쪽 저항이 확인되지 않아 목표는 변동성 시나리오입니다.');
 if(p.ema8<p.ema21)reasons.push('단기 추세가 EMA21 아래에 있습니다.');
 const pullback={low:support.value-atr*.25,high:support.value+atr*.25,stop:support.value-atr*.75};
 if(pullback.high>=entry||pullback.stop<=0)Object.assign(pullback,{low:null,high:null,stop:null});
 const status=reasons.length?'wait':'review';
 return {status,label:status==='wait'?'추격 진입 대기':'진입 조건 검토',asOf:p.asOf,provisional:!!p.provisional,entry,atr,support,stop,riskPct,maxRiskPct,tp1:first.value,tp2:second?.value??null,first,second,rr,extended,pullback,reasons:reasons.length?reasons:['가격 조건 충족 · 실제 진입 전 거래량·시장 상황을 확인하세요.']};
}
