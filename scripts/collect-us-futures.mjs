import{readFile,writeFile}from'node:fs/promises';import{collectUsFutures,retainUsFutures}from'../us-futures-core.mjs';
let old;try{old=JSON.parse(await readFile('data/us-futures.json','utf8'));}catch{}const d=retainUsFutures(await collectUsFutures(),old);await writeFile('data/us-futures.json',JSON.stringify(d));console.log('US futures:',Object.fromEntries(d.items.map(i=>[i.symbol,i.status])));
