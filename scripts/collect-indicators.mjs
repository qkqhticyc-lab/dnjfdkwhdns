import {collectIndicators} from '../quotes-core.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const next=await collectIndicators();let previous;
try{previous=JSON.parse(await readFile('data/indicators.json','utf8'));}catch{}
try{const r=await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/indicators.json',{signal:AbortSignal.timeout(10000)});if(r.ok){const live=await r.json();if(live.schemaVersion===1&&Array.isArray(live.items)&&(!previous||live.collectedAt>previous.collectedAt))previous=live;}}catch{}
next.items=next.items.map(item=>{const old=previous?.items?.find(p=>p.id===item.id&&['ok','stale'].includes(p.status));return item.status==='ok'||!old?item:{...old,status:'stale'};});
await writeFile('data/indicators.json',JSON.stringify(next));console.log('Indicators',next.items.map(i=>i.id+':'+i.status).join(', '));
