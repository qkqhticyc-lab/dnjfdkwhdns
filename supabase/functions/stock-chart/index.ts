import {collectStockChart,chartSymbols} from './quotes-core.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json','Cache-Control':'public,max-age=120'};
const cache=new Map<string,{value:any;expires:number}>(),pending=new Map<string,Promise<any>>();
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='GET')return new Response('{}',{status:405,headers});
 const q=new URL(req.url).searchParams,market=q.get('market')||'',symbol=(q.get('symbol')||'').toUpperCase(),range=q.get('range')||'6mo',exchange=(q.get('exchange')||'').slice(0,60),currency=q.get('currency')||undefined;
 try{chartSymbols(market,symbol,exchange);if(!['1mo','3mo','6mo','1y','2y'].includes(range)||currency&&!({KR:['KRW'],US:['USD'],HK:['HKD','CNY','USD'],JP:['JPY']} as Record<string,string[]>)[market]?.includes(currency))throw Error();}
 catch{return new Response(JSON.stringify({error:'Invalid chart request'}),{status:400,headers:{...headers,'Cache-Control':'no-store'}});}
 const key=JSON.stringify([market,symbol,range,exchange,currency]);
 try{
  let value=cache.get(key);if(!value||value.expires<Date.now()){
   if(!pending.has(key))pending.set(key,collectStockChart({market,symbol,range,exchange,currency}).then(next=>{if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{value:next,expires:Date.now()+300000});return next;}).finally(()=>pending.delete(key)));
   const next=await pending.get(key);value={value:next,expires:Date.now()+300000};
  }
  return new Response(JSON.stringify(value.value),{headers});
 }catch{return new Response(JSON.stringify({error:'Chart source temporarily unavailable'}),{status:502,headers:{...headers,'Cache-Control':'no-store'}});}
});
