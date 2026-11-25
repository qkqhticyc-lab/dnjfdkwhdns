import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {selectScanRun} from '../scan-artifact.mjs';
const gh=args=>execFileSync('gh',args,{encoding:'utf8'}),trigger=process.env.TRIGGER_SCAN_ID||'';
// The completion event identifies its exact artifact. Avoid a filtered list that can still show the preceding run.
const runs=trigger?[]:JSON.parse(gh(['run','list','--workflow','screener.yml','--limit','30','--json','databaseId,status,conclusion,updatedAt']));
const id=selectScanRun(runs,trigger);
if(!id){console.log('No completed scan available; retaining published data.');process.exit(0);}
const dir='.cache/screener-full';await mkdir(dir,{recursive:true});
gh(['run','download',String(id),'--name','screener-full','--dir',dir]);
const source=JSON.parse(gh(['run','view',String(id),'--json','databaseId,attempt']));
const data=JSON.parse(await readFile(dir+'/screener.json','utf8'));
if(source.databaseId!==id||!Number.isSafeInteger(source.attempt)||data.schemaVersion!==1||data.rulesVersion!=='independent-v3'||!data.items?.length||!Array.isArray(data.coverage))throw Error('Completed scan artifact is invalid; refusing to publish an older snapshot as its result');
await writeFile(dir+'/source.json',JSON.stringify(source));
console.log(JSON.stringify({downloadedRunId:id,attempt:source.attempt,collectedAt:data.collectedAt,completedAt:data.completedAt,count:data.items.length}));
