import {getJournalQuote,validQuoteItem} from './journal-quotes-core.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const cache=new Map<string,{value:any;expires:number}>(),pending=new Map<string,Promise<any>>();
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({},405);
 let items:any[];try{const raw=await req.text();if(raw.length>6000)throw Error();const body=JSON.parse(raw);if(!Array.isArray(body.items)||body.items.length>20||!body.items.every(validQuoteItem))throw Error();items=body.items;}catch{return reply({error:'Invalid quote request'},400);}
 const output=Array(items.length);let at=0;
 await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(at<items.length){const i=at++,item=items[i],key=JSON.stringify([item.market,item.symbol,item.currency||'']),old=cache.get(key);try{
  if(old&&old.expires>Date.now()){output[i]=old.value;continue;}
  if(!pending.has(key))pending.set(key,getJournalQuote(item).then(value=>{if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(key,{value,expires:Date.now()+60000});return value;}).finally(()=>pending.delete(key)));
  output[i]=await pending.get(key);
 }catch{output[i]=old?{...old.value,status:'stale'}:{...item,status:'unavailable'};}}}));
 return reply({items:output});
});
