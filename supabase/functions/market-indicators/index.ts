import {collectLiveIndicators,retainLiveItems} from './live-indicators-core.mjs';
import {createRequestCache} from './edge-cache.mjs';
const cache=createRequestCache({ttl:10000});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='GET')return new Response('{}',{status:405,headers});
 const data=await cache('indicators',()=>collectLiveIndicators(),retainLiveItems);
 return new Response(JSON.stringify(data),{headers});
});
