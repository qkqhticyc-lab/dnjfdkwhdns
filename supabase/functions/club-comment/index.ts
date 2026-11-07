const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'},reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{headers,status});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
const rpc=(name:string,body:unknown)=>fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({},405);
 try{const raw=await req.text();if(raw.length>15000)return reply({error:'댓글이 너무 깁니다.'},400);const p=JSON.parse(raw);if(!p||typeof p!=='object'||Array.isArray(p))return reply({error:'댓글 요청을 확인해 주세요.'},400);
  if(p.action==='delete'){if(typeof p.commentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.commentId)||typeof p.deleteToken!=='string'||!/^[0-9a-f]{64}$/.test(p.deleteToken))return reply({error:'삭제 정보를 확인해 주세요.'},400);const r=await rpc('delete_club_comment',{p_comment:p.commentId,p_delete_hash:await hash(p.deleteToken)});if(!r.ok)return reply({error:'댓글 삭제를 완료하지 못했습니다.'},502);return(await r.json())===true?reply({ok:true}):reply({error:'이 댓글을 삭제할 권한이 없습니다.'},403);}
  if(p.action!=null)return reply({error:'지원하지 않는 요청입니다.'},400);
  const nickname=typeof p.nickname==='string'?p.nickname.trim():'익명',body=typeof p.body==='string'?p.body.trim():'';
  if(typeof p.targetId!=='string'||!/^r[123]-[a-z]{2,20}$/.test(p.targetId)||!nickname||nickname.length>30||!body||body.length>2000||p.website)return reply({error:'닉네임과 댓글 내용을 확인해 주세요.'},400);
  const address=(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'unknown').split(',')[0].trim(),clientHash=await hash(key+':club-comment:'+address),token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const r=await rpc('create_club_comment',{p_target:p.targetId,p_nickname:nickname,p_body:body,p_client_hash:clientHash,p_delete_hash:await hash(token)});
  if(!r.ok){const error=await r.text();return error.includes('GUEST_RATE_LIMIT')?reply({error:'댓글을 연속으로 많이 작성했습니다. 잠시 후 다시 작성해 주세요.'},429):reply({error:'댓글을 저장하지 못했습니다. 내용을 확인하고 다시 시도해 주세요.'},400);}
  return reply({id:await r.json(),deleteToken:token},201);
 }catch{return reply({error:'댓글을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},400);}
});
