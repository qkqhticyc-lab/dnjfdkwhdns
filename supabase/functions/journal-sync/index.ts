const base = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const apiHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers});
async function rest(path:string,options:RequestInit={}) {const r=await fetch(base+'/rest/v1/'+path,{...options,headers:{...apiHeaders,...options.headers}});if(!r.ok)throw Error('Storage unavailable');return r;}
Deno.serve(async req => {
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[0-9a-f]{64}$/.test(token))return reply({error:'Invalid share connection'},401);
 try {
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const links=await(await rest('journal_share_links?token_hash=eq.'+hash+'&enabled=eq.true&select=owner_id,nickname')).json();
  if(links.length!==1)return reply({error:'Share connection revoked or invalid'},401);
  const text=await req.text();if(text.length>120000)return reply({error:'Payload too large'},413);
  const body=JSON.parse(text);if(body.action==='check')return reply({ok:true,nickname:links[0].nickname});
  if(!Array.isArray(body.posts)||body.posts.length>30)return reply({error:'Invalid batch'},400);
  const owner=links[0],posts=[];
  for(const p of body.posts){
   if(!/^[0-9a-f]{64}$/.test(p.external_id)||!/^\d{4}-\d{2}-\d{2}$/.test(p.trade_date)||!['KR','US'].includes(p.market)||!['buy','sell'].includes(p.side))return reply({error:'Invalid post'},400);
   if(typeof p.symbol!=='string'||p.symbol.length<1||p.symbol.length>20||typeof p.stock_name!=='string'||p.stock_name.length<1||p.stock_name.length>80||typeof p.reason!=='string'||p.reason.length>3000||typeof p.review!=='string'||p.review.length>5000)return reply({error:'Invalid post fields'},400);
   // Explicit allowlist: account, quantity, price, balance, KIS credentials never enter storage.
   posts.push({owner_id:owner.owner_id,nickname:owner.nickname,source:'account',external_id:p.external_id,trade_date:p.trade_date,market:p.market,symbol:p.symbol,stock_name:p.stock_name,side:p.side,reason:p.reason,review:p.review});
  }
  const suppressed=posts.length?await(await rest('journal_share_suppressions?owner_id=eq.'+owner.owner_id+'&select=external_id')).json():[];
  const omitted=new Set(suppressed.map((r:{external_id:string})=>r.external_id));const allowed=posts.filter(p=>!omitted.has(p.external_id));
  if(allowed.length)await rest('journal_posts?on_conflict=owner_id,external_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(allowed)});
  return reply({ok:true,count:allowed.length});
 }catch{return reply({error:'Sharing temporarily unavailable'},502);}
});
