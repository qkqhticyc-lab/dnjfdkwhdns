import{createStockNewsService}from'./stock-news-source.mjs';
import{validNewsSymbol,validNewsDate}from'./stock-news-core.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const service=createStockNewsService();
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='GET')return new Response('{}',{status:405,headers});
 const q=new URL(req.url).searchParams,market=q.get('market')||'',symbol=(q.get('symbol')||'').toUpperCase(),date=q.get('date')||'',mode=q.get('mode')||'day';
 if(!validNewsSymbol(market,symbol)||!['day','events'].includes(mode)||mode==='day'&&!validNewsDate(date))return new Response(JSON.stringify({error:'Invalid news request'}),{status:400,headers});
 try{return new Response(JSON.stringify(await service({market,symbol,date,mode})),{headers});}catch{return new Response(JSON.stringify({error:'News source temporarily unavailable'}),{status:502,headers});}
});
