import{collectScreener}from'../screener-core.mjs';import{mkdir,readFile,writeFile}from'node:fs/promises';
const shard=Number(process.argv[2]),shards=Number(process.argv[3]),universe=JSON.parse(await readFile('.cache/screener/universe.json','utf8'));let previous;
try{previous=await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/screener.json',{signal:AbortSignal.timeout(20000)}).then(r=>r.json());}catch{}
if(previous?.rulesVersion!=='independent-v3')previous=null;
const result=await collectScreener(fetch,new Date(universe.collectedAt),previous,{universe,shard,shards,onProgress:p=>console.log(JSON.stringify(p))});await mkdir('.cache/screener/results',{recursive:true});await writeFile(`.cache/screener/results/shard-${shard}.json`,JSON.stringify(result));console.log(JSON.stringify({shard,total:result.items.length,ok:result.items.filter(p=>p.status==='ok').length}));
