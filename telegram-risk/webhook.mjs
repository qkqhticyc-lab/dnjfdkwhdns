import {collectLatest,formatLatest} from './latest.mjs';
import {collect} from './collect.mjs';
import {formatReport} from './core.mjs';
export async function webhookSecret(token){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('telegram-risk-webhook-v1:'+token));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
const equal=(a,b)=>{if(typeof a!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
export function command(text){text=String(text||'').trim();if(/^(위험|\[위험\]|\/risk(?:@\w+)?)$/i.test(text))return 'latest';if(/^(마감|\[마감\]|\/close(?:@\w+)?)$/i.test(text))return 'close';if(/^\/(start|help)(?:@\w+)?$/i.test(text))return 'help';return null;}
export function makeWebhook({token,chatId,getLatest=collectLatest,getClose=collect}={}){
 // A warm instance coalesces Telegram retries. It is a read-only endpoint.
 const updates=new Map();let latestCache,closeCache;
 return async req=>{
  if(req.method==='GET')return Response.json({service:'telegram-risk',configured:!!token&&!!chatId,serverTime:new Date().toISOString()});
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  if(!token||!chatId)return new Response('Configuration required',{status:503});
  if(!equal(req.headers.get('x-telegram-bot-api-secret-token'),await webhookSecret(token)))return new Response('Unauthorized',{status:401});
  if(Number(req.headers.get('content-length'))>16384)return new Response('Too large',{status:413});
  let u;try{const body=await req.text();if(body.length>16384)return new Response('Too large',{status:413});u=JSON.parse(body);}catch{return new Response('Invalid request',{status:400});}
  if(u.type==='setup_check')return Response.json({ok:String(u.chat_id)===String(chatId)});
  if(u.type==='diagnostics'&&String(u.chat_id)===String(chatId)){const report=await getLatest();return Response.json({report,html:formatLatest(report)});}
  if(u.message?.chat?.type!=='private'||String(u.message.chat.id)!==String(chatId)||!Number.isSafeInteger(u.update_id))return Response.json({ok:true});
  const kind=command(u.message.text);if(!kind)return Response.json({ok:true});
  if(updates.has(u.update_id))return Response.json({ok:true});
  const task=(async()=>{
   let text;
   try{
    if(kind==='help')text='<b>시장 위험 조회</b>\n\n위험 또는 /risk: 제공처 최신 시세 조회\n마감 또는 /close: 최근 확정 마감 리포트\n\n장중 값은 잠정치이며, 지표별 갱신 시각이 다를 수 있습니다.';
    else if(kind==='latest'){
     if(!latestCache||Date.now()-latestCache.at>30000)latestCache={at:Date.now(),value:getLatest()};
     text=formatLatest(await latestCache.value);
    }else{
     if(!closeCache||Date.now()-closeCache.at>60000)closeCache={at:Date.now(),value:getClose()};
     text=formatReport(await closeCache.value);
    }
   }catch{text='자료 조회에 실패했습니다. 잠시 후 위험 또는 마감을 다시 보내주세요.';latestCache=closeCache=null;}
   // Telegram executes this reply using its own authenticated webhook connection.
   // No token or chat IDs are included in logs, URLs, source files or public data.
   return {method:'sendMessage',chat_id:u.message.chat.id,text,parse_mode:'HTML',link_preview_options:{is_disabled:true},reply_parameters:{message_id:u.message.message_id}};
  })();
  updates.set(u.update_id,task);if(updates.size>200)updates.delete(updates.keys().next().value);
  return Response.json(await task);
 };
}
