import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {collectScreenReferences,screenRefreshDecision} from '../screener-refresh.mjs';
const snapshot=JSON.parse(await readFile('data/screener.json','utf8'));
const references=await collectScreenReferences();
const runs=JSON.parse(execFileSync('gh',['run','list','--workflow','screener.yml','--limit','10','--json','status,createdAt'],{encoding:'utf8'}));
const decision=screenRefreshDecision(snapshot,references,runs);console.log(JSON.stringify(decision));
if(decision.request){execFileSync('gh',['workflow','run','screener.yml','--ref','main'],{stdio:'inherit'});console.log('Requested delayed-market full scan.');}
const delayed=decision.dates.some(date=>date.delayed),active=runs.some(run=>['queued','in_progress','waiting','pending','requested'].includes(run.status));
await writeFile('data/screener.json',JSON.stringify({...snapshot,marketDates:decision.dates,refresh:{checkedAt:new Date().toISOString(),status:decision.request?'requested':delayed&&active?'running':delayed?'waiting':'current'}}));
