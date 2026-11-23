import {webhookSecret} from '../telegram-risk/webhook.mjs';
import {deliver} from '../telegram-risk/core.mjs';
import {collect} from '../telegram-risk/collect.mjs';
import {publishClose} from '../telegram-risk/publish.mjs';
const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
if(!token||!chatId)throw Error('Telegram secrets are required');
await publishClose(await collect(),{token,chatId});
let r;try{r=await fetch('https://lrmevhhdfmpnclomhsmz.supabase.co/functions/v1/telegram-risk',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await webhookSecret(token)},body:JSON.stringify({type:'diagnostics',chat_id:chatId}),signal:AbortSignal.timeout(50000)});}catch{throw Error('Server diagnostic request failed');}
if(!r.ok)throw Error('Server diagnostic HTTP '+r.status);
const {report,html}=await r.json(),loaded=Object.keys(report.displayQuotes||report.quotes||{}).length;
console.log(JSON.stringify({serverTime:report.collectedAt,asOf:report.asOf,stage:report.stage,loaded,quotes:report.quotes,displayQuotes:report.displayQuotes,archiveDate:report.archive?.asOf,missing:report.missing,sourceErrors:report.sourceErrors},null,2));
if(loaded<9||Object.keys(report.quotes||{}).length<2||!report.archive){console.log('DIAGNOSTIC FAILED: missing live fallback or close archive. No Telegram message sent.');process.exitCode=1;}
else if(process.argv.includes('--send-test')){await deliver('<b>조회 표시 수정 · 서버 응답 점검</b>\n\n'+html,{token,chatId});console.log('Server quote/fallback test report sent successfully.');}
