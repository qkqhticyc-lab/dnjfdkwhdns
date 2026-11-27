import{screenEntryType}from'./entry-types.mjs';
export const SCREEN_FEATURE_VERSION=1;
// NYSE official 2024–2028 calendars. Short sessions are never treated as full sessions.
export const EARLY_CLOSES=new Set(['2024-07-03','2024-11-29','2024-12-24','2025-07-03','2025-11-28','2025-12-24','2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
export const SESSION_SOURCE='https://www.nyse.com/markets/hours-calendars';
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
export function screenClosedRows(rows,market,now=new Date()){
 const time=market==='US'?new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now):null;
 return rows.filter(p=>!p.provisional||market==='US'&&EARLY_CLOSES.has(p.asOf)&&time>='13:00').map(p=>p.provisional?{...p,provisional:false}:p);
}
export function volumeSnapshot(rows,index,market){
 const p=rows[index],date=p?.asOf||p?.date;if(!p||p.provisional||p.extended||p.regularSession===false||!Number.isFinite(p.volume)||p.volume<0)return{asOf:date,ratio:null,regularRatio:null,reason:'완료 정규장 거래량 자료 부족'};
 const completed=rows.slice(0,index).filter(p=>!p.provisional&&!p.extended&&p.regularSession!==false),prior=completed.slice(-20),regular=completed.filter(p=>!p.provisional&&!(market==='US'&&EARLY_CLOSES.has(p.asOf||p.date))).slice(-20);
 const average=list=>list.length===20&&list.every(p=>Number.isFinite(p.volume)&&p.volume>=0)?mean(list.map(p=>p.volume)):null;
 const raw=average(prior),full=average(regular),short=market==='US'&&EARLY_CLOSES.has(date),known=market!=='US'||Number(date?.slice(0,4))>=2024&&Number(date?.slice(0,4))<=2028;
 return{asOf:date,ratio:raw>0?p.volume/raw:null,regularRatio:known&&!short&&full>0?p.volume/full:null,shortSession:short,referenceShortSessions:prior.filter(p=>market==='US'&&EARLY_CLOSES.has(p.asOf||p.date)).length,reason:short?'미국 조기 폐장봉 · 일반 정규장과 비교 제외':!known?'정규장 길이 확인 필요':full>0?null:'직전 20개 정상 길이 정규장 거래량 부족'};
}
export function signalVolumeInputs(rows,frames,index,type,market){
 const current=volumeSnapshot(rows,index,market),regular=p=>!p.provisional&&Number.isFinite(p.volume)&&p.volume>=0&&!(market==='US'&&EARLY_CLOSES.has(p.asOf||p.date));
 const prior=rows.slice(Math.max(0,index-10),index),recent=prior.slice(-3),before=prior.slice(0,-3);
 let contraction=recent.length===3&&before.length>=5&&prior.every(regular)?mean(recent.map(p=>p.volume))<mean(before.map(p=>p.volume)):null;
 if(type==='triangle'){
  const start=frames[index]?.pattern?.triangle?.start;
  const formation=Number.isInteger(start)?rows.slice(start,index):[];
  if(formation.length>=10&&formation.every(regular)){const middle=Math.floor(formation.length/2);contraction=mean(formation.slice(middle).map(p=>p.volume))<mean(formation.slice(0,middle).map(p=>p.volume));}
  else contraction=null;
 }
 let sellContraction=null,recoveryIncrease=null;
 if(type==='boxRetest'){
  const breakout=frames[index]?.pattern?.box?.breakout,formation=Number.isInteger(breakout)?rows.slice(breakout+1,index):[],sell=formation.filter(p=>p.close<p.open);
  if(formation.length&&formation.every(regular)&&sell.length&&regular(rows[breakout])){sellContraction=mean(sell.map(p=>p.volume))<rows[breakout].volume;recoveryIncrease=regular(rows[index])?rows[index].volume>mean(sell.map(p=>p.volume)):null;}
 }
 return{...current,type,contraction,sellContraction,recoveryIncrease};
}
export function typedVolumeAssessment(input,strict=false){
 if(!input||!Number.isFinite(input.ratio)||!Number.isFinite(input.regularRatio))return{known:false,pass:false,reason:input?.reason||'신호봉 거래량 자료 부족'};
 const r=Math.min(input.ratio,input.regularRatio),type=input.type;
 let threshold,known=true,pass=false,reason;
 if(type==='breakout'){threshold=strict?2:1.5;pass=r>=threshold;reason='돌파봉 '+threshold+'배 이상';}
 else if(type==='pullback'||type==='triangle'){threshold=type==='triangle'?1.5:strict?1.2:1;known=typeof input.contraction==='boolean';pass=known&&input.contraction&&r>=threshold;reason=(type==='triangle'?'수렴':'눌림')+' 거래량 감소 + 회복·돌파봉 '+threshold+'배 이상';}
 else if(type==='boxRetest'){threshold=1;known=typeof input.sellContraction==='boolean'&&typeof input.recoveryIncrease==='boolean';pass=known&&input.sellContraction&&input.recoveryIncrease&&r>=1;reason='재확인 매도 거래량 감소 + 회복봉 거래량 증가';}
 else return{known:false,pass:false,reason:'해당 진입 유형의 세분 거래량 기준 미설정'};
 if(known&&(type==='pullback'||type==='triangle'))reason+=' · 거래량 수축 '+(input.contraction?'확인':'미충족');if(known&&type==='boxRetest')reason+=' · 매도 감소 '+(input.sellContraction?'확인':'미충족')+' / 회복 증가 '+(input.recoveryIncrease?'확인':'미충족');return{known,pass,threshold,ratio:r,reason:known?reason+' · 비교 '+r.toFixed(2)+'배':reason+' · 과정 자료 부족'};
}
export function screenFeatureInputs(rows,guide,signal,market){
 const index=signal?rows.findIndex(p=>p.asOf===signal.asOf):-1;
 return{version:SCREEN_FEATURE_VERSION,asOf:rows.at(-1)?.asOf,currentVolume:volumeSnapshot(rows,rows.length-1,market),signalVolume:index>=0?signalVolumeInputs(rows,guide.frames,index,screenEntryType(signal),market):null};
}
export function listingFacts(stock,market,now=new Date()){
 const raw=stock.marketValueRaw,cap=raw!=null&&String(raw).trim()!==''?Number(String(raw).replaceAll(',','')):null;
 return{marketCap:Number.isFinite(cap)&&cap>0?{value:cap,currency:market==='KR'?'KRW':market==='US'?'USD':'JPY',asOf:stock.localTradedAt||null,collectedAt:now.toISOString(),source:'Naver listing marketValueRaw'}:null,listingRisk:{tradable:stock.tradableStatus==='tradable'&&stock.tradeStopType?.name==='TRADING'?true:stock.tradableStatus&&stock.tradableStatus!=='tradable'||stock.tradeStopType?.name&&stock.tradeStopType.name!=='TRADING'?false:null,asOf:stock.localTradedAt||null}};
}
