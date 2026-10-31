import {collectMarket} from './market-core.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const data=await collectMarket();
let previous;try{previous=JSON.parse(await readFile('data/market.json','utf8'));}catch{}
for(const code of Object.keys(data.markets))if(data.markets[code].status!=='ok'&&previous?.markets?.[code]?.status==='ok')data.markets[code]={...previous.markets[code],status:'stale'};
await writeFile('data/market.json',JSON.stringify(data));
console.log(Object.fromEntries(Object.entries(data.markets).map(([key,value])=>[key,value.status])));
