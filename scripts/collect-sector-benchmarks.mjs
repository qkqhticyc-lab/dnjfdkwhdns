import{mkdir,readFile,writeFile}from'node:fs/promises';
import{normalizeSectorBenchmark,validSectorBenchmarks}from'../sector-benchmark-core.mjs';
const now=new Date(),root='.cache/sector-benchmarks';await mkdir(root,{recursive:true});
let previous;for(const path of[root+'/publish.json','published'])try{const data=path==='published'?await fetch('https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/sector-benchmarks.json',{signal:AbortSignal.timeout(12000)}).then(r=>r.json()):JSON.parse(await readFile(path,'utf8'));if(validSectorBenchmarks(data)&&(!previous||data.collectedAt>previous.collectedAt))previous=data;}catch{}
const stamp=d=>d.toISOString().slice(0,10).replaceAll('-',''),start=stamp(new Date(now.getTime()-220*86400000))+'0000',end=stamp(now)+'2359';
const items=await Promise.all(['KR','US'].map(async market=>{const old=previous?.items.find(p=>p.market===market&&p.status!=='unavailable');try{
 const url='https://api.stock.naver.com/chart/'+(market==='KR'?'domestic/index/KOSPI':'foreign/index/.INX')+'/day?'+new URLSearchParams({startDateTime:start,endDateTime:end});const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Index history unavailable');const next=normalizeSectorBenchmark(await r.json(),market,now);if(old?.asOf>next.asOf)throw Error('Older benchmark ignored');return next;
}catch{return old?{...old,status:'stale'}:{market,status:'unavailable',points:[]};}}));
const output={schemaVersion:1,collectedAt:now.toISOString(),items};if(!validSectorBenchmarks(output))throw Error('Invalid sector benchmarks');await writeFile(root+'/publish.json',JSON.stringify(output));console.log(JSON.stringify(items.map(({market,status,asOf})=>({market,status,asOf}))));
