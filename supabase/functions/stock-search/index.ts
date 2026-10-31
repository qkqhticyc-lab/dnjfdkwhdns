import {searchStocks} from './stock-search-core.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Content-Type':'application/json','Cache-Control':'public,max-age=60'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='GET')return new Response('{}',{status:405,headers});
 const url=new URL(req.url),q=(url.searchParams.get('q')||'').trim(),market=url.searchParams.get('market')||'KR';
 if(!q||q.length>80||!['KR','US','HK','JP'].includes(market))return new Response(JSON.stringify({error:'Invalid search'}),{status:400,headers});
 try{return new Response(JSON.stringify({items:await searchStocks(q,market),source:'네이버페이 증권 종목 검색'}),{headers});}
 catch{return new Response(JSON.stringify({error:'Search temporarily unavailable'}),{status:502,headers});}
});
