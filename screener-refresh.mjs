import {collectStockChart} from './quotes-core.mjs';
import {liveDailyRows} from './live-chart-core.mjs';
import {screenMarketDates} from './screener-freshness.mjs';

// Check the same daily provider as the scanner, after each market's actual close.
// A delayed or unavailable index alone must not hide a stale stock snapshot.
export async function collectScreenReferences(fetcher=fetch,now=new Date()){
 const definitions=[['KR','005930'],['KR','000660'],['US','AAPL'],['US','AMD'],['JP','7203'],['JP','6758']],references={};
 await Promise.all(definitions.map(async([market,symbol])=>{
  try{const data=await collectStockChart({market,symbol,range:'1mo'},fetcher),rows=liveDailyRows(data,now).filter(p=>!p.provisional),date=rows.at(-1)?.asOf;
   if(date&&(!references[market]||date>references[market].asOf))references[market]={status:'ok',asOf:date};
  }catch{/* One failing or suspended reference does not erase the other. */}
 }));return references;
}
export function screenRefreshDecision(snapshot,references,runs=[],now=new Date()){
 const dates=screenMarketDates(snapshot.items||[],references),delayed=dates.filter(p=>p.delayed);
 if(!delayed.length)return {request:false,reason:'마감 자료가 최신입니다.',dates};
 if(runs.some(run=>['queued','in_progress','waiting','pending','requested'].includes(run.status)))return {request:false,reason:'전체 검사가 이미 대기 또는 실행 중입니다.',dates};
 if(runs.some(run=>{const start=Date.parse(run.createdAt||run.created_at);return Number.isFinite(start)&&now.getTime()-start<30*60000;}))return {request:false,reason:'최근 검사 후 제공처 갱신을 기다립니다.',dates};
 return {request:true,reason:delayed.map(p=>p.label+' '+(p.latest||'미제공')+' → '+p.reference).join(' / '),dates};
}
