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
const num=(n,d=1)=>finite(n)?n.toFixed(d):'미확인';
const signed=(n,d=1)=>finite(n)?`${n>0?'+':''}${n.toFixed(d)}`:'미확인';
export const REPORT_FORMAT_VERSION=2;
const escapeHTML=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// Korean is two columns wide in a monospace block. Keep rows <= 31 columns.
export const columnWidth=s=>[...String(s)].reduce((w,c)=>w+(/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7af\uff01-\uff60]/u.test(c)?2:1),0);
const cell=(s,width,right=false)=>{s=String(s);const spaces=' '.repeat(Math.max(0,width-columnWidth(s)));return right?spaces+s:s+spaces;};
const table=(headers,rows,widths)=>'<pre>'+escapeHTML([headers,...rows].map(row=>row.map((s,i)=>cell(s,widths[i],i>0)).join(' ')).join('\n'))+'</pre>';
const explanations={
 stable:'이번 규칙에서 뚜렷한 복합 위험 신호가 잡히지 않았습니다. 개별 종목의 하락 가능성은 남아 있습니다.',
 tension:'단기 불안이 커지는 초기 신호입니다. 다른 시장에서도 불안이 번지는지 살펴볼 구간입니다.',
 fracture:'변동성 구조가 역전됐거나, 역전 근접과 주가 약세가 겹쳤습니다. 시장 불안이 확대된 구간입니다.',
 trigger:'단기 주식시장 불안과 채권 변동성 급등이 겹쳤습니다. 가격이 크게 흔들릴 수 있는 구간입니다.',
 warning:'같은 날짜의 자료가 부족하거나 늦어 종합 판단을 보류했습니다.'
};
export function formatReport(report,previous){
 const s=STAGES[report.stage],t=report.technical;
 const transition=previous?.stage&&previous.stage!==report.stage?`\n단계 변화: ${escapeHTML(STAGES[previous.stage]?.[2]||previous.stage)} → ${s[2]}`:'';
 const metricRows=[['주식 불안 VIX','VIX'],['불안 변동 VVIX','VVIX'],['꼬리위험 SKEW','SKEW'],['채권 변동 MOVE','MOVE'],['달러 강도 DXY','DXY']].map(([label,id])=>[label,num(report.values[id]?.value),finite(report.values[id]?.change)?signed(report.values[id].change,2)+'%':'미확인']);
 const lightText={green:'양호',yellow:'주의',red:'경계',unknown:'보류'};
 const curveRows=[['3개월−30일',signed(report.curve),lightText[report.lights.curve]],['6개월−3개월',signed(report.long),lightText[report.lights.long]],['30일/3개월',num(report.ratio,3),lightText[report.lights.ratio]],['9일−30일',signed(report.short),lightText[report.lights.short]]];
 const reasons=[];
 if(report.reasons.includes('BACKWARDATION'))reasons.push('• 단기 변동성 역전: 향후 30일의 주가 변동 우려가 향후 3개월 평균보다 큽니다.');
 else if(report.reasons.includes('NEAR_BW'))reasons.push('• 역전 근접: 단기 불안이 커져 기간별 변동성 차이가 좁아졌습니다.');
 if(report.reasons.includes('MOVE'))reasons.push(`• 채권 불안 동반: MOVE가 전일보다 ${signed(report.values.MOVE?.change,2)}% 움직였습니다.`);
 if(report.reasons.includes('SPX'))reasons.push('• 주가 약세 동반: S&P 500이 단기 약세 조건에 해당합니다.');
 if(!reasons.length)reasons.push('• 현재 규칙의 복합 위험 조건에 해당하지 않습니다.');
 if(report.stage==='warning')reasons.splice(0,reasons.length,`• 부족한 자료: ${report.missing.join(', ')||'자료 지연'}`);
 const trend=t?.trend==='ABOVE'?'30주 평균선 위':t?.trend==='BELOW'?'30주 평균선 아래':'장기 추세 미확인';
 const strength=!finite(t?.adx)?'추세 강도 미확인':t.adx<20?'추세 강도 약함':t.adx<25?'추세가 형성되는 구간':'추세 강도 높음';
 const direction=!finite(t?.minusDI)||!finite(t?.plusDI)?'방향 미확인':t.minusDI>t.plusDI?'하락 방향 우세':t.plusDI>t.minusDI?'상승 방향 우세':'방향 균형';
 const arrow=value=>value==null?'':value?' ↑':' ↓';
 return `<b>시장 리스크 보드 · 미국 마감</b>\n${escapeHTML(report.asOf||'기준일 미확인')} 미국 거래일 · 종가 기준\n\n<b>${s[0]} ${s[2]} · ${s[1]}</b>${transition}\n<blockquote>${explanations[report.stage]}</blockquote>\n\n<b>① 왜 이런 단계인가요?</b>\n${reasons.map(escapeHTML).join('\n')}\n\n<b>② 주요 지표</b>\n${table(['지표','현재','변화율'],metricRows,[14,7,8])}\n전일 대비는 지표 자체의 변화율입니다.\n\n<b>③ 기간별 불안 신호</b>\n🟢 양호 · 🟡 주의 · 🔴 경계\n${table(['비교 항목','값','판정'],curveRows,[14,7,4])}\n${report.curve==null?'기간별 변동성 비교 자료가 부족합니다.':report.curve<0?'단기 역전 상태: 가까운 시기의 불안이 더 큽니다.':report.structure==='NEAR_BACKWARDATION'?'단기 역전 근접: 불안이 높아지는지 관찰합니다.':'정상 기울기: 단기 불안의 역전은 없습니다.'}\n\n<b>④ 실제 주가 흐름 · S&amp;P 500</b>\n${trend} · ${direction}\n${strength}\n${table(['지표','값'],[['평균 변동 ATR',num(t?.atr)+arrow(t?.atrRising)],['추세 강도 ADX',num(t?.adx)+arrow(t?.adxRising)],['하락 힘 −DI',num(t?.minusDI)],['상승 힘 +DI',num(t?.plusDI)]],[14,9])}\nATR은 하루 변동폭의 평균값(pt), ADX는 방향이 아닌 추세 강도입니다. ↑↓는 전일 대비입니다.\n\n<b>용어를 쉽게 보면</b>\n• VIX: 앞으로 30일간의 주가 변동 예상\n• VVIX: VIX 자체가 흔들릴 것으로 보는 정도\n• SKEW: 극단적 가격 변동에 대비한 옵션 가격 반영\n• MOVE: 채권 금리의 변동 불안\n• DXY: 주요 통화 대비 달러의 강도\n\n<i>자체 추정 규칙 v${report.ruleVersion} · 위험 단계는 폭락 확률이나 매매 지시를 뜻하지 않습니다.</i>`;
}
export function deliveryKey(report){return `${report.ruleVersion}:${report.asOf}:${report.stage}:format${REPORT_FORMAT_VERSION}`;}
export function shouldDeliver(report,state){return report.stage!=='warning'&&!report.stale&&!state?.sent?.includes(deliveryKey(report));}
export async function deliver(text,{token,chatId,fetcher=fetch}){
 if(!token||!chatId)throw Error('Telegram secrets are required');
 let response;try{response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(15000)});}catch{throw Error('Telegram transport failed; delivery outcome unknown. Check the chat before retrying.');}
 let data;try{data=await response.json();}catch{throw Error('Telegram returned an invalid response');}
 if(!response.ok||data.ok!==true)throw Error(`Telegram rejected delivery (HTTP ${response.status}, code ${Number(data.error_code)||0})`);
 return true;
}
