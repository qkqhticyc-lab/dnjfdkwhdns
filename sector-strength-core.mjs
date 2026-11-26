import {liveDailyRows} from './live-chart-core.mjs';
import {SECTORS} from './sector-core.mjs';
import {screenEntryType} from './entry-types.mjs';

export const SECTOR_STRENGTH_VERSION=1;
const horizons=[5,20,60];
const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b),n=a.length;return n?(a[(n-1)>>1]+a[n>>1])/2:null;};
export function sectorStrengthInputs(rows){
 const last=rows.at(-1),end=last?.asOf||last?.date;
 if(!end||!Number.isFinite(last.close)||last.close<=0)return null;
 const windows=Object.fromEntries(horizons.map(h=>{const start=rows.at(-h-1);return[h,start?.close>0?{from:start.asOf||start.date,return:(last.close/start.close-1)*100}:null];}));
 const average=rows.length>=20?rows.slice(-20).reduce((sum,r)=>sum+r.close,0)/20:null;
 return {version:SECTOR_STRENGTH_VERSION,asOf:end,windows,above20:average>0?last.close>average:null};
}
export function sectorBenchmark(indicator,market,asOf,now=new Date()){
 const rows=liveDailyRows({market,timezone:market==='KR'?'Asia/Seoul':'America/New_York',bars:(indicator?.points||[]).map(p=>({date:p.date,close:p.close}))},now).filter(p=>!p.provisional&&p.asOf<=asOf&&Number.isFinite(p.close)&&p.close>0);
 return rows.at(-1)?.asOf===asOf?sectorStrengthInputs(rows):null;
}
// The caller supplies the latest closed, liquid universe, before any entry-type filters.
export function sectorStrength(rows,classifications,benchmark){
 const asOf=rows.reduce((d,p)=>p.status==='ok'&&p.asOf>d?p.asOf:d,''),groups=new Map();
 let available=0,classified=0,measured=0;
 for(const p of rows){
  if(p.status!=='ok'||p.asOf!==asOf)continue;available++;
  const id=classifications.get(p.market+':'+p.symbol)?.id;if(!SECTORS[id]||id==='unknown')continue;classified++;
  const inputs=p.sectorStrength;
  if(inputs?.version!==SECTOR_STRENGTH_VERSION||inputs.asOf!==asOf||!benchmark||benchmark.asOf!==asOf)continue;
  if(![5,20].every(h=>Number.isFinite(inputs.windows?.[h]?.return)&&inputs.windows[h].from===benchmark.windows?.[h]?.from&&Number.isFinite(benchmark.windows[h].return))||typeof inputs.above20!=='boolean')continue;
  measured++;const group=groups.get(id)||{id,name:SECTORS[id],items:[]};group.items.push(p);groups.set(id,group);
 }
 const results=[...groups.values()].map(g=>{
  const items=g.items,n=items.length,returns=Object.fromEntries(horizons.map(h=>[h,median(items.filter(p=>p.sectorStrength.windows[h]?.from===benchmark.windows[h]?.from).map(p=>p.sectorStrength.windows[h]?.return))]));
  const relative=Object.fromEntries(horizons.map(h=>[h,Number.isFinite(returns[h])&&Number.isFinite(benchmark.windows[h]?.return)?returns[h]-benchmark.windows[h].return:null]));
  const breadth=items.filter(p=>p.sectorStrength.above20).length/n*100;
  const recentSignals=items.filter(p=>p.signal?.status==='active'&&p.signal.age<5&&['breakout','pullback','triangle','boxRetest','reclaim'].includes(screenEntryType(p.signal))).length;
  const turnoverRatio=median(items.map(p=>p.liquidity?.average>0&&Number.isFinite(p.liquidity.last)?p.liquidity.last/p.liquidity.average:null));
  const heat=returns[5]>=10&&items.filter(p=>p.rsi>=70).length/n>=.4;
  let state='watch';
  if(n>=5){
   if(returns[5]>0&&returns[20]>0&&relative[5]>0&&relative[20]>0&&breadth>=60)state='leader';
   else if(returns[5]>0&&relative[5]>0&&breadth>=50)state='improving';
   else if(returns[20]<=0&&relative[20]>0)state='defensive';
  }
  return{id:g.id,name:g.name,count:n,asOf,returns,relative,breadth,recentSignals,signalRate:recentSignals/n*100,turnoverRatio,heat,state};
 });
 const order={leader:0,improving:1,defensive:2,watch:3};results.sort((a,b)=>order[a.state]-order[b.state]||b.relative[20]-a.relative[20]||b.breadth-a.breadth);
 return{asOf,available,classified,measured,benchmarkAsOf:benchmark?.asOf||null,groups:results,leaders:results.filter(g=>g.state!=='watch')};
}
