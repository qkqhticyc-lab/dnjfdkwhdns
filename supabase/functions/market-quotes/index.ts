const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json','Cache-Control':'public,max-age=60'};
let cached:any,pending:Promise<any>|null=null,expires=0;
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='GET')return new Response('{}',{status:405,headers});
 if(Date.now()>expires){
  if(!pending)pending=fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/indicators.json',{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error();const next=await r.json();if(next.schemaVersion!==1||!Array.isArray(next.items))throw Error();cached=next;expires=Date.now()+120000;return next;}).finally(()=>{pending=null;});
  try{await pending;}catch{if(!cached)return new Response(JSON.stringify({error:'Snapshot unavailable'}),{status:502,headers:{...headers,'Cache-Control':'no-store'}});cached={...cached,items:cached.items.map((p:any)=>p.status==='ok'?{...p,status:'stale'}:p)};expires=Date.now()+30000;}
 }
 return new Response(JSON.stringify(cached),{headers});
});
