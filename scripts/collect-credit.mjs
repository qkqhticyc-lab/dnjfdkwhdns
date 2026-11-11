import {collectCredit,retainCredit,validateCreditData} from '../credit-core.mjs';
import {readFile,writeFile} from 'node:fs/promises';
let data;const candidates=[];
try{candidates.push(JSON.parse(await readFile('data/credit.json','utf8')));}catch{}
try{const r=await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/credit.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(r.ok)candidates.push(await r.json());}catch{}
const previous=candidates.filter(validateCreditData).sort((a,b)=>Number(b.sourceProvider==='KOFIA')-Number(a.sourceProvider==='KOFIA')||b.asOf.localeCompare(a.asOf)||b.collectedAt.localeCompare(a.collectedAt))[0];
try{data=await collectCredit();if(previous?.sourceProvider==='KOFIA'&&data.asOf<previous.asOf)throw Error('Official source returned an older basis date');}
catch(error){
 data=retainCredit(previous);console.warn('Credit source failed; retaining previous dated history:',error.message);
}
await writeFile('data/credit.json',JSON.stringify(data));
console.log('Credit:',data.sourceProvider||'legacy source',data.status,data.asOf,data.points.length+' paired daily observations, normalized '+data.unit);
