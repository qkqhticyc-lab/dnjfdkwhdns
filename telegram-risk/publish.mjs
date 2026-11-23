import {webhookSecret} from './webhook.mjs';
import {validClose} from './cache.mjs';
export async function publishClose(report,{token,chatId,fetcher=fetch}={}){
 if(!validClose(report))return false;
 if(!token||!chatId)throw Error('Telegram secrets required for close cache');
 const r=await fetcher('https://lrmevhhdfmpnclomhsmz.supabase.co/functions/v1/telegram-risk',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await webhookSecret(token)},body:JSON.stringify({type:'publish_close',chat_id:chatId,report}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Close cache publish HTTP '+r.status);
 return true;
}
