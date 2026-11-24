import {collectLiveIndicators,retainLiveItems,LIVE_INDICATORS,collectAlternateIndicator} from './live-indicators-core.mjs';
import {createRequestCache} from './edge-cache.mjs';
import {collectIndicatorHistory,retainHistory} from './indicator-history.mjs';
const cache=createRequestCache({ttl:10000});
const historyCache=createRequestCache({ttl:300000});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='GET')return new Response('{}',{status:405,headers});
 if(new URL(req.url).searchParams.get('sourceCheck')==='1'){
  const now=new Date(),checks=await Promise.all(['nasdaq','sp500'].map(async id=>{try{const q=await collectAlternateIndicator(LIVE_INDICATORS.find(p=>p.id===id),fetch,now);return{id,status:'ok',provider:q.provider,price:q.price,changePercent:q.changePercent,quoteAt:q.quoteAt,points:q.points.length};}catch{return{id,status:'unavailable'};}}));
  return new Response(JSON.stringify({schemaVersion:1,collectedAt:now.toISOString(),checks}),{headers});
 }
 const data=new URL(req.url).searchParams.get('history')==='1'?await historyCache('history',()=>collectIndicatorHistory(),retainHistory):await cache('indicators',()=>collectLiveIndicators(),retainLiveItems);
 return new Response(JSON.stringify(data),{headers});
});
