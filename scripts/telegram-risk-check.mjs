import {webhookSecret} from '../telegram-risk/webhook.mjs';
import {deliver} from '../telegram-risk/core.mjs';
const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
if(!token||!chatId)throw Error('Telegram secrets are required');
let r;try{r=await fetch('https://lrmevhhdfmpnclomhsmz.supabase.co/functions/v1/telegram-risk',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await webhookSecret(token)},body:JSON.stringify({type:'diagnostics',chat_id:chatId}),signal:AbortSignal.timeout(50000)});}catch{throw Error('Server diagnostic request failed');}
if(!r.ok)throw Error('Server diagnostic HTTP '+r.status);
const {report,html}=await r.json(),loaded=Object.keys(report.quotes||{}).length;
console.log(JSON.stringify({serverTime:report.collectedAt,asOf:report.asOf,stage:report.stage,loaded,quotes:report.quotes,missing:report.missing,sourceErrors:report.sourceErrors},null,2));
if(loaded<8){console.log('DIAGNOSTIC FAILED: fewer than 8 quotes. No Telegram message sent.');process.exitCode=1;}
else if(process.argv.includes('--send-test')){await deliver('<b>현재값 조회 복구 확인</b>\n\n'+html,{token,chatId});console.log('Server current-value test report sent successfully.');}
