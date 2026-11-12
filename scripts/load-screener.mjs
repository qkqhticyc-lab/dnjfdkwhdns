import{readFile,writeFile}from'node:fs/promises';
const candidates=[];for(const path of['data/screener.json','.cache/screener-full/screener.json'])try{candidates.push(JSON.parse(await readFile(path,'utf8')));}catch{}
try{candidates.push(await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/screener.json',{signal:AbortSignal.timeout(15000)}).then(r=>r.json()));}catch{}
const valid=candidates.filter(d=>d.schemaVersion===1&&d.rulesVersion==='independent-v3'&&Array.isArray(d.items)&&d.items.length&&Array.isArray(d.coverage));
valid.sort((a,b)=>Number(b.universeScope==='all-provider-listed')-Number(a.universeScope==='all-provider-listed')||b.collectedAt.localeCompare(a.collectedAt));if(!valid.length)throw Error('No valid screener data');
await writeFile('data/screener.json',JSON.stringify(valid[0]));console.log(JSON.stringify({scope:valid[0].universeScope||'legacy-limited',count:valid[0].items.length,collectedAt:valid[0].collectedAt}));
