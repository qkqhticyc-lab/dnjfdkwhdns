import {collectCredit,retainCredit,validateCreditData} from '../credit-core.mjs';
import {readFile,writeFile} from 'node:fs/promises';
let data;
try{data=await collectCredit();}
catch(error){
 const candidates=[];
 try{candidates.push(JSON.parse(await readFile('data/credit.json','utf8')));}catch{}
 try{const r=await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/credit.json',{signal:AbortSignal.timeout(12000)});if(r.ok)candidates.push(await r.json());}catch{}
 const previous=candidates.filter(validateCreditData).sort((a,b)=>b.asOf.localeCompare(a.asOf)||b.collectedAt.localeCompare(a.collectedAt))[0];
 data=retainCredit(previous);console.warn('Credit source failed; retaining previous dated history:',error.message);
}
await writeFile('data/credit.json',JSON.stringify(data));
console.log('Credit:',data.status,data.asOf,data.points.length+' daily observations, source amounts in '+data.unit);
