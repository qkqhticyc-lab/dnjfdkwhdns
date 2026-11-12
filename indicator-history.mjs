import{LIVE_INDICATORS}from'./live-indicators-core.mjs';
const symbols=['^TNX','^KS11','^KQ11','^IXIC','^DJI','^GSPC','^VIX','CL=F','BZ=F','GC=F','SI=F','HG=F'];
export function lastThreeDays(points){const sorted=[...new Map(points.filter(p=>/^\d{14}$/.test(p.at)&&Number.isFinite(p.price)&&p.price>0).map(p=>[p.at,p])).values()].sort((a,b)=>a.at.localeCompare(b.at)),days=[...new Set(sorted.map(p=>p.at.slice(0,8)))].slice(-3);return sorted.filter(p=>days.includes(p.at.slice(0,8)));}
export function parseWeek(def,data){const r=data?.result||data;if(r?.code!==def.code||r.infoType!==def.type||r.periodType!=='week'||!r.priceInfos||Array.isArray(r.priceInfos))throw Error('Wrong week identity');return lastThreeDays(Object.values(r.priceInfos).flat().filter(p=>p.localDateTime<=r.localDateTimeNow).map(p=>({at:p.localDateTime,price:p.currentPrice})));}
export function parseIntraday(symbol,data,now=new Date()){
 const r=data?.chart?.result?.[0],m=r?.meta,q=r?.indicators?.quote?.[0];if(m?.symbol!==symbol||m.dataGranularity!=='5m'||!m.exchangeTimezoneName||!q)throw Error('Wrong intraday identity');
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:m.exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 return lastThreeDays((r.timestamp||[]).filter(t=>t*1000<=now.getTime()+60000).map(t=>({at:format.format(new Date(t*1000)).replace(/\D/g,''),price:q.close[r.timestamp.indexOf(t)]})));
}
export function mergeThreeDay(history,live){
 if(!history?.points?.length)return live?.points||[];
 // Merge only the same Reuters identity/provider. Yahoo series remain separate.
 return lastThreeDays(history.provider==='naver'&&history.code===live?.code?[...history.points,...(live.points||[])]:history.points);
}
export async function collectIndicatorHistory(fetcher=fetch,now=new Date()){
 const items=Array(12);let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<12){const i=cursor++,d=LIVE_INDICATORS[i],naver=['domestic','index'].includes(d.category),url=naver?`https://api.stock.naver.com/chart/${d.category==='domestic'?'domestic':'foreign'}/index/${encodeURIComponent(d.code)}?periodType=week`:`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbols[i])}?range=5d&interval=5m&includePrePost=false`;
  try{const r=await fetcher(url,{signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();const points=naver?parseWeek(d,await r.json()):parseIntraday(symbols[i],await r.json(),now);if(!points.length)throw Error();items[i]={id:d.id,code:d.code,status:'ok',provider:naver?'naver':'yahoo',symbol:naver?d.code:symbols[i],points,collectedAt:now.toISOString()};}catch{items[i]={id:d.id,status:'unavailable'};}
 }}));return{schemaVersion:1,collectedAt:now.toISOString(),items};
}
export function retainHistory(next,previous){return{...next,items:next.items.map(n=>{const p=previous?.items?.find(p=>p.id===n.id&&p.points?.length);return p&&(!n.points?.length||n.points.at(-1).at<p.points.at(-1).at)?{...p,status:'stale'}:n;})};}
