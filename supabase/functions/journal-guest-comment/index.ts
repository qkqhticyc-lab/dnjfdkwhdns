const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'},reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
const rpc=(name:string,body:unknown)=>fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({},405);
 try{const raw=await req.text();if(raw.length>15000)return reply({error:'댓글이 너무 깁니다.'},400);const p=JSON.parse(raw),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(p.action==='delete'){if(!uuid.test(p.commentId)||typeof p.deleteToken!=='string'||!/^[0-9a-f]{64}$/.test(p.deleteToken))return reply({error:'삭제 정보를 확인해 주세요.'},400);const r=await rpc('delete_guest_journal_comment',{p_comment:p.commentId,p_delete_hash:await hash(p.deleteToken)});if(!r.ok)return reply({error:'댓글 삭제를 완료하지 못했습니다.'},502);return(await r.json())===true?reply({ok:true}):reply({error:'삭제 권한을 확인할 수 없습니다.'},403);}
  const nickname=typeof p.nickname==='string'?p.nickname.trim():'익명',body=typeof p.body==='string'?p.body.trim():'';
  if(!uuid.test(p.postId)||!nickname||nickname.length>30||!body||body.length>2000||p.website)return reply({error:'닉네임과 댓글 내용을 확인해 주세요.'},400);
  const address=(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'unknown').split(',')[0].trim(),clientHash=await hash(key+':guest:'+address),token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const r=await rpc('create_guest_journal_comment',{p_post:p.postId,p_nickname:nickname,p_body:body,p_client_hash:clientHash,p_delete_hash:await hash(token)});
  if(!r.ok){const text=await r.text();return text.includes('GUEST_RATE_LIMIT')?reply({error:'댓글을 연속으로 많이 작성했습니다. 잠시 후 다시 작성해 주세요.'},429):reply({error:'댓글을 저장하지 못했습니다. 글이 삭제됐는지 확인하고 다시 시도해 주세요.'},400);}
  return reply({id:await r.json(),deleteToken:token},201);
 }catch{return reply({error:'댓글 요청을 확인해 주세요.'},400);}
});
