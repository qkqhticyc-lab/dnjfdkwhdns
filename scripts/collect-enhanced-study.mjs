import{excludedStock}from'../screener-core.mjs';
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{gzipSync}from'node:zlib';
import{ENHANCED_STUDY_VERSION,STUDY_FIELDS}from'../enhanced-study-core.mjs';
const root=process.env.ENHANCED_STUDY_OUTPUT||'.cache/enhanced-study';await mkdir(root,{recursive:true});
let manifest={schemaVersion:1,studyVersion:ENHANCED_STUDY_VERSION,status:'unavailable',parts:[]};
try{
 const scan=JSON.parse(await readFile(process.env.ENHANCED_STUDY_INPUT||'.cache/screener-full/screener.json','utf8')),items=scan.items.filter(p=>['KR','US','JP'].includes(p.market)&&p.status==='ok'&&!excludedStock(p)&&(p.market!=='JP'||p.screenFeatures?.version===1));
 if(!items.length||items.some(p=>p.enhancedStudyVersion!==ENHANCED_STUDY_VERSION||!Array.isArray(p.enhancedStudy)))throw Error('New historical feature scan pending');
 const groups=new Map();for(const p of items)for(const record of p.enhancedStudy){const key=p.market+'-'+record[0].slice(0,7);if(!groups.has(key))groups.set(key,{market:p.market,month:record[0].slice(0,7),stocks:new Map()});const group=groups.get(key);if(!group.stocks.has(p.symbol))group.stocks.set(p.symbol,[]);group.stocks.get(p.symbol).push(record);}
 const parts=[];for(const[key,group]of groups){const payload={schemaVersion:1,studyVersion:ENHANCED_STUDY_VERSION,collectedAt:scan.collectedAt,market:group.market,month:group.month,stocks:[...group.stocks]},bytes=gzipSync(JSON.stringify(payload,(_k,v)=>typeof v==='number'&&!Number.isInteger(v)?Number(v.toFixed(8)):v)),name=key+'.json.gz';await writeFile(root+'/'+name,bytes);parts.push({market:group.market,month:group.month,url:name,count:[...group.stocks.values()].reduce((s,a)=>s+a.length,0),bytes:bytes.length});}
 parts.sort((a,b)=>a.month.localeCompare(b.month)||a.market.localeCompare(b.market));const date=new Date((parts.at(-1)?.month||scan.collectedAt.slice(0,7))+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-5);
 manifest={schemaVersion:1,studyVersion:ENHANCED_STUDY_VERSION,status:'ok',collectedAt:scan.collectedAt,fields:STUDY_FIELDS,parts,cutoff:date.toISOString().slice(0,10),evaluated:items.length,universe:scan.items.filter(p=>['KR','US','JP'].includes(p.market)).length,unavailableHistorical:['발생 당시 시가총액','당시 전체 시장 RS 백분위','당시 전체 구성 종목 섹터 강도','임상·실적 이벤트·ADR·SPAC 과거 분류','완전한 V2 점수'],marketStatus:Object.fromEntries(['KR','US','JP'].map(m=>[m,{status:items.some(p=>p.market===m)?'ok':'pending',evaluated:items.filter(p=>p.market===m).length}])),classificationBasis:'현재 업종 분류·현재 상장 종목의 제공 이력'};
}catch(error){manifest.reason=error.message;}
await writeFile(root+'/manifest.json',JSON.stringify(manifest));console.log(JSON.stringify({...manifest,parts:manifest.parts.length}));
