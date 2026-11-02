import {collectMarket,MARKETS} from './market-core.mjs';
import {collectOptions} from './options-core.mjs';
import {createRequestCache} from './edge-cache.mjs';
const cache=createRequestCache({ttl:20000});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const mergeMarket=(next,previous)=>({...next,markets:Object.fromEntries(Object.entries(next.markets).map(([code,n])=>{const p=previous?.markets?.[code];return[code,p&&['ok','stale'].includes(p.status)&&(n.status!=='ok'||n.date<p.date||(n.date===p.date&&n.points.at(-1).time<p.points.at(-1).time))?{...p,status:'stale'}:n];}))});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='GET')return new Response('{}',{status:405,headers});
 const params=new URL(req.url).searchParams,code=params.get('market');
 if(code&&!MARKETS.includes(code))return new Response('{}',{status:400,headers});
 let data;
 if(params.get('options')==='1')data=await cache('options',()=>collectOptions(),(n,p)=>n.status==='ok'||!p||p.status==='unavailable'?n:{...p,status:'stale'});
 else if(code)data=await cache(code,()=>collectMarket(fetch,[code]),mergeMarket);
 else {const results=await Promise.all(MARKETS.map(c=>cache(c,()=>collectMarket(fetch,[c]),mergeMarket)));data={...results[0],markets:Object.assign({},...results.map(r=>r.markets))};}
 return new Response(JSON.stringify(data),{headers});
});
