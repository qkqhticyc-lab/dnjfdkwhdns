import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {collect} from '../telegram-risk/collect.mjs';
import {formatReport,shouldDeliver,deliveryKey,deliver} from '../telegram-risk/core.mjs';
const dir='.cache/telegram-risk';await mkdir(dir,{recursive:true});
let state={schemaVersion:1,sent:[]};
try{state=JSON.parse(await readFile(dir+'/state.json','utf8'));if(state.schemaVersion!==1||!Array.isArray(state.sent))throw Error('Invalid notification state');}catch(e){if(e.code!=='ENOENT')throw e;}
const report=await collect(),message=formatReport(report,state.last);
await writeFile(dir+'/report.json',JSON.stringify(report,null,2));await writeFile(dir+'/preview.txt',message);
await writeFile(dir+'/preview.html','<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>텔레그램 메시지 미리보기</title><style>body{margin:0;background:#e5eef0;color:#18252c;font:15px/1.6 Arial,sans-serif}article{max-width:360px;margin:16px auto;padding:18px;background:white;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box}pre{font:12px/1.7 monospace;white-space:pre;overflow-x:auto;margin:8px 0;padding:10px 4px;background:#f1f5f7;border-radius:6px}blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid #d76640;background:#fff4ed}i{font-size:12px;color:#52646e}</style><article>'+message+'</article></html>');
console.log(message);
if(process.argv.includes('--send')){
 if(shouldDeliver(report,state)){
  await deliver(message,{token:process.env.TELEGRAM_BOT_TOKEN,chatId:process.env.TELEGRAM_CHAT_ID});
  state.sent=[...state.sent,deliveryKey(report)].slice(-120);state.last={asOf:report.asOf,stage:report.stage};
  await writeFile(dir+'/state.json.tmp',JSON.stringify(state));await rename(dir+'/state.json.tmp',dir+'/state.json');
  console.log('Telegram delivery confirmed.');
 }else console.log('No delivery: duplicate, missing or stale data.');
}else console.log('Preview only. No Telegram message sent.');
