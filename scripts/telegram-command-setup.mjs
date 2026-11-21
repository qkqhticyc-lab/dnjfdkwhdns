import {webhookSecret} from '../telegram-risk/webhook.mjs';
const endpoint='https://lrmevhhdfmpnclomhsmz.supabase.co/functions/v1/telegram-risk';
const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
if(!token||!chatId)throw Error('Telegram secrets are required');
const health=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});if(!health.ok)throw Error('Command endpoint is unavailable');
if(!(await health.json()).configured){console.log('SETUP PENDING: add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to Supabase Edge Function secrets. Existing close notifications are unchanged.');process.exit(0);}
const secret=await webhookSecret(token);
const check=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify({type:'setup_check',chat_id:chatId}),signal:AbortSignal.timeout(15000)});
if(!check.ok||!(await check.json()).ok)throw Error('GitHub and Supabase Telegram settings do not match');
async function call(method,body){let r;try{r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw Error('Telegram setup request failed');}const data=await r.json();if(!r.ok||!data.ok)throw Error(`Telegram setup rejected: HTTP ${r.status}`);return data.result;}
await call('setWebhook',{url:endpoint,secret_token:secret,allowed_updates:['message'],max_connections:1});
await call('setMyCommands',{commands:[{command:'risk',description:'최신 시세로 위험 조회'},{command:'close',description:'최근 마감 리포트'},{command:'help',description:'사용 방법'}]});
const info=await call('getWebhookInfo',{});if(info.url!==endpoint)throw Error('Webhook URL verification failed');
console.log('Telegram command webhook configured. Send 위험 or /risk to your bot.');
