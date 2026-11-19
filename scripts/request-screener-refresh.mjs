import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {collectScreenReferences,screenRefreshDecision} from '../screener-refresh.mjs';
const snapshot=JSON.parse(await readFile('data/screener.json','utf8'));
const references=await collectScreenReferences();
const runs=JSON.parse(execFileSync('gh',['run','list','--workflow','screener.yml','--limit','10','--json','status,createdAt'],{encoding:'utf8'}));
const decision=screenRefreshDecision(snapshot,references,runs);console.log(JSON.stringify(decision));
if(decision.request){execFileSync('gh',['workflow','run','screener.yml','--ref','main'],{stdio:'inherit'});console.log('Requested delayed-market full scan.');}
