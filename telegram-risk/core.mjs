import {wilderRange} from '../technical-core.mjs';

// Versioned reconstruction, not the original author's undisclosed rules.
export const RULES = Object.freeze({version:1,spreadRed:1,spreadYellow:2,ratioRed:.98,ratioYellow:.95,longYellow:1,shortRed:2,shortYellow:-1,moveLevel:100,moveJump:10,spxFall:-1});
export const STAGES={stable:['🔵','STABLE','안정 구간'],tension:['🟤','TENSION','긴장 구간'],fracture:['🟠','FRACTURE','구조 균열'],trigger:['🔴','TRIGGER','위험 촉발'],warning:['⚠️','WARNING','판정 보류']};
const finite=Number.isFinite;
const day=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function nyClock(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)};
}
export function completed(rows,now=new Date()){
 const c=nyClock(now);
 return rows.filter(p=>day(p.date)&&finite(p.close)&&p.close>0&&(p.date<c.date||(p.date===c.date&&c.minutes>=17*60+30))).sort((a,b)=>a.date.localeCompare(b.date));
}
export function parseCboe(text){
 const lines=text.trim().split(/\r?\n/),head=lines.shift().split(',').map(s=>s.trim().toUpperCase()),idx=head.indexOf('CLOSE')>=0?head.indexOf('CLOSE'):1;
 if(head[0]!=='DATE')throw Error('Unexpected Cboe format');
 const rows=lines.map(line=>{const v=line.split(','),m=v[0]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return {date:m?`${m[3]}-${m[1]}-${m[2]}`:'',close:v[idx]?.trim()?Number(v[idx]):NaN};});
 if(!rows.length||rows.some((p,i)=>!day(p.date)||!finite(p.close)||p.close<=0||(i&&p.date<=rows[i-1].date)))throw Error('Invalid Cboe history');
 return rows;
}
export function parseYahoo(json){
 const r=json.chart?.result?.[0],q=r?.indicators?.quote?.[0];if(!r?.timestamp||!q)throw Error('Yahoo series unavailable');
 return r.timestamp.map((t,i)=>({date:nyClock(new Date(t*1000)).date,open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i]})).filter(p=>day(p.date)&&finite(p.close)&&p.close>0);
}
function observation(rows,date){const i=rows.findIndex(p=>p.date===date);if(i<0)return null;const p=rows[i],old=rows[i-1];return {value:p.close,change:old?.close>0?(p.close/old.close-1)*100:null,date};}
export function structure(rows,date){
 const bars=rows.filter(p=>p.date<=date),last=bars.at(-1);if(last?.date!==date)return null;
 // 30 actual weekly closes, including this week's as-of close (no future data).
 const weeks=new Map();for(const p of bars){const d=new Date(p.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));weeks.set(d.toISOString().slice(0,10),p.close);}
 const closes=[...weeks.values()],ma30=closes.length>=30?closes.slice(-30).reduce((a,b)=>a+b,0)/30:null;
 const a=wilderRange(bars,14),prev=wilderRange(bars.slice(0,-1),14),ma20=bars.length>=20?bars.slice(-20).reduce((s,p)=>s+p.close,0)/20:null;
 return {symbol:'SPX',date,close:last.close,ma30,trend:ma30==null?'UNKNOWN':last.close>=ma30?'ABOVE':'BELOW',ma20,...a,atrRising:finite(a.atr)&&finite(prev.atr)?a.atr>prev.atr:null,adxRising:finite(a.adx)&&finite(prev.adx)?a.adx>prev.adx:null};
}
export function assess(series,{now=new Date(),rules=RULES}={}){
 const spx=completed(series.SPX||[],now),vix=completed(series.VIX||[],now),date=[spx.at(-1)?.date,vix.at(-1)?.date].filter(Boolean).sort().at(-1)||null;
 const ids=['VIX','VIX3M','VIX6M','VIX9D','VVIX','SKEW','MOVE','DXY','SPX'];
 const values=Object.fromEntries(ids.map(id=>[id,date?observation(completed(series[id]||[],now),date):null]));
 const missing=ids.filter(id=>!values[id]),v=id=>values[id]?.value;
 const curve=v('VIX3M')&&v('VIX')?v('VIX3M')-v('VIX'):null,long=v('VIX6M')&&v('VIX3M')?v('VIX6M')-v('VIX3M'):null,ratio=v('VIX3M')&&v('VIX')?v('VIX')/v('VIX3M'):null,short=v('VIX9D')&&v('VIX')?v('VIX9D')-v('VIX'):null;
 const lights={curve:curve==null?'unknown':curve<=rules.spreadRed?'red':curve<=rules.spreadYellow?'yellow':'green',long:long==null?'unknown':long<=0?'red':long<=rules.longYellow?'yellow':'green',ratio:ratio==null?'unknown':ratio>=rules.ratioRed?'red':ratio>=rules.ratioYellow?'yellow':'green',short:short==null?'unknown':short>=rules.shortRed?'red':short>=rules.shortYellow?'yellow':'green'};
 const backwardation=curve!=null&&curve<0,near=!backwardation&&((ratio!=null&&ratio>=rules.ratioYellow)||(curve!=null&&curve<=rules.spreadRed));
 const technical=date?structure(spx,date):null;
 const spxWeak=(values.SPX?.change!=null&&values.SPX.change<=rules.spxFall)||(technical?.ma20!=null&&technical.close<technical.ma20&&technical.minusDI>technical.plusDI);
 const moveShock=v('MOVE')>=rules.moveLevel&&values.MOVE?.change>=rules.moveJump;
 let candidate='stable',reasons=[];
 if(backwardation){candidate=moveShock?'trigger':'fracture';reasons=['BACKWARDATION',...(moveShock?['MOVE']:[])];}
 else if(near){candidate=spxWeak?'fracture':'tension';reasons=['NEAR_BW',...(spxWeak?['SPX']:[])];}
 else if(moveShock){candidate='tension';reasons=['MOVE'];}
 // Never manufacture a safe classification from missing or old inputs.
 const stale=!date||Date.parse(nyClock(now).date)-Date.parse(date)>4*86400000;
 const stage=missing.length||stale?'warning':candidate;
 return {schemaVersion:1,ruleVersion:rules.version,mode:'close',asOf:date,collectedAt:now.toISOString(),stage,candidate,missing,stale,values,curve,long,ratio,short,lights,technical,reasons,structure:curve==null?'UNKNOWN':backwardation?'BACKWARDATION':near?'NEAR_BACKWARDATION':'CONTANGO'};
}
const dots={red:'🔴',yellow:'🟡',green:'🟢',unknown:'⚪'};
const num=(n,d=1)=>finite(n)?n.toFixed(d):'미확인';
const signed=(n,d=1)=>finite(n)?`${n>0?'+':''}${n.toFixed(d)}`:'미확인';
export function formatReport(report,previous){
 const s=STAGES[report.stage],t=report.technical,metric=id=>`${num(report.values[id]?.value)} (${signed(report.values[id]?.change,2)}%)`;
 const transition=previous?.stage&&previous.stage!==report.stage?`${STAGES[previous.stage]?.[2]||previous.stage} → ${s[2]}\n`:'';
 return `시장 리스크 보드 · 미국 마감\n${transition}\n현재 단계 ${s[0]} ${s[1]} (${s[2]})\n핵심 신호 ${report.reasons.join(' + ')||'없음'}\n\nTAIL HEDGE · SKEW ${metric('SKEW')}\nVOL OF VOL · VVIX ${metric('VVIX')}\nVIX LEVEL · VIX ${metric('VIX')}\nVIX STRUCTURE ${report.structure}\n30D–3M · 3M−VIX ${signed(report.curve)} ${dots[report.lights.curve]}\n3M–6M · 6M−3M ${signed(report.long)} ${dots[report.lights.long]}\nCURVE RATIO · VIX/3M ${num(report.ratio,3)} ${dots[report.lights.ratio]}\nSHORT STRESS · 9D−VIX ${signed(report.short)} ${dots[report.lights.short]}\nRATES VOL · MOVE ${metric('MOVE')}\nUSD STRESS · DXY ${metric('DXY')}\n\n[구조 리스크 · S&P 500]\n30W TREND ${t?.trend||'UNKNOWN'}\nATR(14) ${num(t?.atr)} ${t?.atrRising==null?'':t.atrRising?'↑':'↓'}\nADX(14) ${num(t?.adx)} ${t?.adxRising==null?'':t.adxRising?'↑':'↓'}\nDI −DI ${num(t?.minusDI)} / +DI ${num(t?.plusDI)}\n\n미국 거래일 ${report.asOf||'미확인'} · 종가 기준\n${report.stage==='warning'?`판정 보류: ${report.missing.join(', ')||'자료 지연'}\n`:''}자체 추정 규칙 v${report.ruleVersion} · 폭락 확률을 뜻하지 않습니다.`;
}
export function deliveryKey(report){return `${report.ruleVersion}:${report.asOf}:${report.stage}`;}
export function shouldDeliver(report,state){return report.stage!=='warning'&&!report.stale&&!state?.sent?.includes(deliveryKey(report));}
export async function deliver(text,{token,chatId,fetcher=fetch}){
 if(!token||!chatId)throw Error('Telegram secrets are required');
 let response;try{response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(15000)});}catch{throw Error('Telegram transport failed; delivery outcome unknown. Check the chat before retrying.');}
 let data;try{data=await response.json();}catch{throw Error('Telegram returned an invalid response');}
 if(!response.ok||data.ok!==true)throw Error(`Telegram rejected delivery (HTTP ${response.status}, code ${Number(data.error_code)||0})`);
 return true;
}
