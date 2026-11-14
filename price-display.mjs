// KRX cash-equity quote units; presentation only, strategy comparisons retain raw precision.
export function krTick(v){return v<2000?1:v<5000?5:v<20000?10:v<50000?50:v<200000?100:v<500000?500:1000;}
export function displayPrice(v,currency){if(!Number.isFinite(v))return null;return currency==='KRW'?Math.round(v/krTick(v))*krTick(v):v;}
const priceDigits=(v,currency)=>currency==='KRW'||currency==='JPY'?0:currency==='USD'&&Math.abs(v)<1?4:2;
export function formatPrice(v,currency,{whole=false}={}){if(!Number.isFinite(v))return '—';const p=displayPrice(v,currency);if(whole&&p>0&&p<1)return '1 미만';return p.toLocaleString('ko-KR',{minimumFractionDigits:currency==='USD'&&!whole?2:0,maximumFractionDigits:whole?0:priceDigits(p,currency)});}
export const formatTarget=(v,currency)=>formatPrice(v,currency,{whole:currency!=='USD'});
// Match the visible price precision; this is relative to the signal entry, never to a user's fill.
export function priceDistancePct(value,entry,currency){if(!Number.isFinite(value)||!Number.isFinite(entry)||entry<=0)return null;const visible=v=>Number(displayPrice(v,currency).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:priceDigits(v,currency)})),basis=visible(entry),pct=basis>0?(visible(value)/basis-1)*100:null;return Number.isFinite(pct)?Number(pct.toFixed(10)):null;}
export function formatPriceReason(text,currency){return String(text||'').replace(/(과매도 반등 손절|삼각수렴 상단선|박스 상단|신호 종가|초기 손절|직전 추적 손절선|갭 발생봉 고가|발생봉 고가|이전 봉 고가|저장 갭 기준|되돌림 기준|저장 목표|돌파 기준|기준 가격|손절가|목표가|TP[12]|EMA(?:8|14|21|55)|종가|고가|저가|손절|저항|지지)\s+([0-9][0-9,]*(?:\.[0-9]+)?)/g,(_,label,value)=>label+' '+formatTarget(Number(value.replaceAll(',','')),currency));}
