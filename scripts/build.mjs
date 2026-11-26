import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {fingerprintAssets} from './fingerprint-assets.mjs';
const config=JSON.parse(await readFile('site.config.json','utf8'));
const key=config.supabase?.publishableKey||'';
if(key.startsWith('sb_secret_'))throw Error('A server secret must never be placed in the browser config.');
if(key.startsWith('eyJ')){const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(claims.role!=='anon')throw Error('Only an anon/publishable key may be shipped.');}
await mkdir('dist',{recursive:true});
await build({entryPoints:['app.js'],bundle:true,outfile:'dist/app.js',format:'esm',target:['es2022'],minify:true,legalComments:'eof'});
for(const file of ['lounge.html','lounge.css','chart-compare.html','chart-compare.css','chart-news.css','screener.html','screener.css','chart-workspace.css','chart-guide.css','flow-overview.css','club.html','club.css','index.html','etfs.html','etfs.css','reports.html','community.html','journals.html','journals.css','credit.html','credit.css','charts.html','quotes-charts.css','chart-analysis.css','sentiment.css','styles.css','site-pages.css','site.config.json','.nojekyll'])await copyFile(file,'dist/'+file);
await mkdir('dist/data',{recursive:true});
for(const file of ['sector-map.html','sector-map.css'])await copyFile(file,'dist/'+file);
await copyFile('market-breadth.css','dist/market-breadth.css');
const {validateBreadth}=await import('../market-breadth-core.mjs');
let breadth;try{breadth=JSON.parse(await readFile('data/market-breadth.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;breadth=JSON.parse(gunzipSync(await readFile('data/market-breadth.seed.json.gz')).toString('utf8'));}if(!validateBreadth(breadth))throw Error('Invalid market breadth data');
await writeFile('dist/data/market-breadth.json',JSON.stringify(breadth));
await copyFile('news.html','dist/news.html');
await copyFile('news.css','dist/news.css');
const {validateMarketNews}=await import('../market-news-core.mjs');
let news={schemaVersion:1,attemptedAt:new Date().toISOString()};
for(const name of ['domestic','global','calendar'])news[name]={status:'unavailable',fetchedAt:null,items:[]};
try{news=JSON.parse(await readFile('.cache/news/publish.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!validateMarketNews(news))throw Error('Invalid market news data');
await writeFile('dist/data/news.json',JSON.stringify(news));
const research=JSON.parse(await readFile('data/research.json','utf8'));
if(research.schemaVersion!==1||!['targets','earnings','overseas'].every(key=>Array.isArray(research[key]?.items)))throw Error('Invalid research data');
await copyFile('data/research.json','dist/data/research.json');
await copyFile('data/market.json','dist/data/market.json');await copyFile('data/us-futures.json','dist/data/us-futures.json');
const credit=JSON.parse(await readFile('data/credit.json','utf8'));
const {validateCreditData}=await import('../credit-core.mjs');if(!validateCreditData(credit))throw Error('Invalid credit data');
await copyFile('data/credit.json','dist/data/credit.json');
await copyFile('position-monitor.css','dist/position-monitor.css');
const {validatePositionMonitor}=await import('../position-monitor-core.mjs');
let positions={schemaVersion:1,kr:{status:'unavailable',rows:[]},us:{status:'unavailable',rows:[]}};
try{positions=JSON.parse(await readFile('.cache/position-monitor/publish.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!validatePositionMonitor(positions))throw Error('Invalid position monitor data');
await writeFile('dist/data/position-monitor.json',JSON.stringify(positions));
const indicators=JSON.parse(await readFile('data/indicators.json','utf8'));if(indicators.schemaVersion!==1||indicators.items?.length!==12)throw Error('Invalid indicator data');await copyFile('data/indicators.json','dist/data/indicators.json');
const {validateSentimentData}=await import('../sentiment-core.mjs');const sentiment=JSON.parse(await readFile('data/sentiment.json','utf8'));if(!validateSentimentData(sentiment))throw Error('Invalid sentiment data');await copyFile('data/sentiment.json','dist/data/sentiment.json');
const {validateETFData}=await import('../etf-core.mjs');const etfs=JSON.parse(await readFile('data/etfs.json','utf8'));if(!validateETFData(etfs))throw Error('Invalid ETF data');await copyFile('data/etfs.json','dist/data/etfs.json');
for(const file of ['screener.json','indicator-history.json'])await copyFile('data/'+file,'dist/data/'+file);
// A small freshness manifest lets the independent scheduler avoid downloading every stock on each check.
const scan=JSON.parse(await readFile('data/screener.json','utf8'));
const {screenMarketDates}=await import('../screener-freshness.mjs');
await writeFile('dist/data/screener-status.json',JSON.stringify({schemaVersion:1,rulesVersion:scan.rulesVersion,collectedAt:scan.collectedAt,completedAt:scan.completedAt,scanRunId:scan.scanRunId,scanAttempt:scan.scanAttempt,marketDates:screenMarketDates(scan.items)}));
const {validSignalManifest,ALERT_SHARDS}=await import('../signal-tools-publish.mjs');
let signalManifest={schemaVersion:1,studyVersion:1,status:'unavailable',collectedAt:null,notificationShards:ALERT_SHARDS};
try{signalManifest=JSON.parse(await readFile('.cache/signal-tools/signal-tools.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!validSignalManifest(signalManifest))throw Error('Invalid signal tools manifest');
await writeFile('dist/data/signal-tools.json',JSON.stringify(signalManifest));
for(const name of ['signal-study.json',...Array.from({length:ALERT_SHARDS},(_,index)=>`alerts-${String(index).padStart(2,'0')}.json`)]){
 let payload={...signalManifest,groups:[],stocks:{}};
 try{payload=JSON.parse(await readFile('.cache/signal-tools/'+name,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(payload.collectedAt!==signalManifest.collectedAt)throw Error('Mixed signal tool generations');
 await writeFile('dist/data/'+name,JSON.stringify(payload));
}
await copyFile('notifications.css','dist/notifications.css');
let alertCalendar={schemaVersion:1,status:'unavailable',collectedAt:null,items:[]};
try{alertCalendar=JSON.parse(await readFile('.cache/signal-tools/alert-calendar.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(alertCalendar.schemaVersion!==1||!Array.isArray(alertCalendar.items))throw Error('Invalid alert calendar');
await writeFile('dist/data/alert-calendar.json',JSON.stringify(alertCalendar));
for(const file of (await readdir('dist')).filter(name=>name.endsWith('.html'))){
 const html=await readFile('dist/'+file,'utf8');
 await writeFile('dist/'+file,html.replace('</head>','<link rel="stylesheet" href="./notifications.css"></head>'));
}
let sectors={schemaVersion:1,collectedAt:null,items:[],coverage:[]};try{const candidate=JSON.parse(await readFile('.cache/sectors/publish/sectors.json','utf8'));if(candidate.schemaVersion!==1||!Array.isArray(candidate.items))throw Error('Invalid sector data');sectors=candidate;}catch{}await writeFile('dist/data/sectors.json',JSON.stringify(sectors));
await copyFile('earnings.css','dist/earnings.css');
const {validEarnings}=await import('../earnings-core.mjs');
let earnings={schemaVersion:1,status:'unavailable',collectedAt:null,items:[]};
try{earnings=JSON.parse(await readFile('.cache/earnings/publish.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(!validEarnings(earnings))throw Error('Invalid quarterly earnings data');
await writeFile('dist/data/earnings.json',JSON.stringify(earnings));
const {validUsMarketCalendar}=await import('../us-market-calendar-core.mjs');
let usCalendar;try{usCalendar=JSON.parse(await readFile('.cache/us-calendar/publish.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;usCalendar=JSON.parse(await readFile('data/us-calendar-official.json','utf8'));}
if(!validUsMarketCalendar(usCalendar))throw Error('Invalid US market calendar');
await writeFile('dist/data/us-market-calendar.json',JSON.stringify(usCalendar));
const version=await fingerprintAssets('dist');
console.log('Built dist/. Assets '+version.revision+'. '+(config.supabase?.url?'Supabase configured.':'Hosting and database connection still required.'));
