import {collectSectorSummary,collectSectorStocks,retainSectorSummary,SECTOR_ETFS,currentSectorStocks} from '../../../live-sector-core.mjs';
import {SECTORS} from '../../../sector-core.mjs';
import {createRequestCache} from '../../../edge-cache.mjs';
const cache=createRequestCache({ttl:300000});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='GET')return new Response('{}',{status:405,headers});
 const url=new URL(req.url),market=url.searchParams.get('market')||'US',sector=url.searchParams.get('sector');
 if(!['US','KR'].includes(market)||sector&&(!SECTORS[sector]||sector==='unknown'||market==='US'&&!SECTOR_ETFS[sector]))return new Response('{}',{status:400,headers});
 try{
  const summary=await cache('summary-'+market,()=>collectSectorSummary(market),retainSectorSummary);
  if(!sector)return new Response(JSON.stringify(summary),{headers});
  const stocks=await cache('stocks-'+market+(market==='KR'?'-'+sector:''),()=>collectSectorStocks(market,sector,fetch,new Date(),summary));
  return new Response(JSON.stringify({...stocks,sector,...currentSectorStocks(stocks.items,sector,summary.sessionDate)}),{headers});
 }catch{return new Response(JSON.stringify({schemaVersion:1,status:'unavailable'}),{status:503,headers});}
});
