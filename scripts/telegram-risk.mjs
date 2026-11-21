import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {collect} from '../telegram-risk/collect.mjs';
import {formatReport,shouldDeliver,deliveryKey,deliver} from '../telegram-risk/core.mjs';
const dir='.cache/telegram-risk';await mkdir(dir,{recursive:true});
let state={schemaVersion:1,sent:[]};
try{state=JSON.parse(await readFile(dir+'/state.json','utf8'));if(state.schemaVersion!==1||!Array.isArray(state.sent))throw Error('Invalid notification state');}catch(e){if(e.code!=='ENOENT')throw e;}
const report=await collect(),message=formatReport(report,state.last);
await writeFile(dir+'/report.json',JSON.stringify(report,null,2));await writeFile(dir+'/preview.txt',message);
console.log(message);
if(process.argv.includes('--send')){
 if(shouldDeliver(report,state)){
  await deliver(message,{token:process.env.TELEGRAM_BOT_TOKEN,chatId:process.env.TELEGRAM_CHAT_ID});
  state.sent=[...state.sent,deliveryKey(report)].slice(-120);state.last={asOf:report.asOf,stage:report.stage};
  await writeFile(dir+'/state.json.tmp',JSON.stringify(state));await rename(dir+'/state.json.tmp',dir+'/state.json');
  console.log('Telegram delivery confirmed.');
 }else console.log('No delivery: duplicate, missing or stale data.');
}else console.log('Preview only. No Telegram message sent.');
