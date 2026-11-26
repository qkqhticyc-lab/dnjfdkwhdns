import {liveDailyRows} from './live-chart-core.mjs';
export function normalizeSectorBenchmark(raw,market,now=new Date()){
 if(!['KR','US'].includes(market)||!Array.isArray(raw))throw Error('Invalid sector benchmark');
 const bars=raw.filter(p=>/^\d{8}$/.test(p.localDate||'')&&Number.isFinite(p.closePrice)&&p.closePrice>0).map(p=>({date:p.localDate.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),close:p.closePrice})).sort((a,b)=>a.date.localeCompare(b.date));
 if(new Set(bars.map(p=>p.date)).size!==bars.length)throw Error('Duplicate benchmark dates');
 const rows=liveDailyRows({market,timezone:market==='KR'?'Asia/Seoul':'America/New_York',bars},now).filter(p=>!p.provisional);
 if(rows.length<61)throw Error('Insufficient benchmark history');
 return{market,id:market==='KR'?'kospi':'sp500',status:'ok',asOf:rows.at(-1).asOf,collectedAt:now.toISOString(),points:rows.map(p=>({date:p.asOf,close:p.close})),source:'Naver index daily history'};
}
export function validSectorBenchmarks(data){
 return data?.schemaVersion===1&&Array.isArray(data.items)&&data.items.length===2&&new Set(data.items.map(p=>p.market)).size===2&&data.items.every(p=>['KR','US'].includes(p.market)&&['ok','stale','unavailable'].includes(p.status)&&Array.isArray(p.points)&&(p.status==='unavailable'||p.points.length>=61&&p.asOf===p.points.at(-1).date&&p.points.every((v,i)=>/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&Number.isFinite(v.close)&&v.close>0&&(!i||v.date>p.points[i-1].date))));
}
