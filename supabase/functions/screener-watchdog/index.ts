import {collectScreenReferences} from '../../../screener-refresh.mjs';
import {watchdogWindow,watchdogDecision} from '../../../scan-watchdog-core.mjs';
import {createRequestCache} from '../../../edge-cache.mjs';
import {verifyWatchdog} from '../../../scan-watchdog-auth.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, x-screener-watchdog-signature, x-screener-watchdog-at','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),token=Deno.env.get('GITHUB_ACTIONS_TOKEN');
const repo='qkqhticyc-lab/dnjfdkwhdns',cache=createRequestCache({ttl:60000});
const response=(body,status=200)=>new Response(JSON.stringify(body),{headers,status});
async function db(path,body,method=body?'POST':'GET') {
 const r=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('State store HTTP '+r.status);
 return r.status===204||r.headers.get('content-length')==='0'?null:r.text().then(t=>t?JSON.parse(t):null);
}
async function github(path,body) {
 const r=await fetch('https://api.github.com/repos/'+repo+'/actions/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'investment-screener-watchdog'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Scheduler HTTP '+r.status);
 return r.status===204?null:r.json();
}
let secret;
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method==='GET') {
  try {const rows=await cache('state',()=>db('screener_watchdog_state?key=eq.latest&select=payload')),state=rows?.[0]?.payload||{};return response({schemaVersion:1,...state,githubConfigured:!!token});}catch{return response({schemaVersion:1,status:'unavailable',githubConfigured:!!token},503);}
 }
 if(req.method!=='POST')return response({},405);
 const supplied=req.headers.get('x-screener-watchdog-signature'),at=req.headers.get('x-screener-watchdog-at');
 if(!/^[a-f0-9]{64}$/.test(supplied||'')||!/^\d{10}$/.test(at||'')||Math.abs(Date.now()-Number(at)*1000)>120000)return response({},401);
 try {
  const body=await req.json().catch(()=>({})),now=new Date(),force=body.force===true;
  secret ||= await db('rpc/screener_watchdog_key',{});
  if(!await verifyWatchdog(secret,supplied,at,force))return response({},401);
  if(!force&&!watchdogWindow(now))return response({status:'outside_window'});
  // Only the authenticated scheduler collects references. Public GET reads its cached observation.
  const getSnapshot=async()=>{
   const base='https://qkqhticyc-lab.github.io/dnjfdkwhdns/data/',options={cache:'no-store',signal:AbortSignal.timeout(15000)};
   let r=await fetch(base+'screener-status.json',options);
   // Compatibility only until the first status-manifest publication; normal checks fetch ~1 KB.
   if(r.status===404)r=await fetch(base+'screener.json',options);
   if(!r.ok)throw Error('Snapshot unavailable');return r.json();
  };
  const [references,snapshot]=await Promise.all([collectScreenReferences(),getSnapshot()]);
  if(snapshot.schemaVersion!==1||snapshot.rulesVersion!=='independent-v3'||!snapshot.items?.length&&!snapshot.marketDates?.length)throw Error('Invalid snapshot');
  let decision=watchdogDecision(snapshot,references);
  if(token&&decision.dates.some(p=>p.delayed)) {
   const [scans,pages]=await Promise.all([github('workflows/screener.yml/runs?per_page=30'),github('workflows/pages.yml/runs?per_page=10')]);
   decision=watchdogDecision(snapshot,references,scans.workflow_runs,pages.workflow_runs,now);
   if(decision.action) {
    const claimed=await db('rpc/claim_screener_watchdog',{p_action:decision.action});
    if(claimed)await github('workflows/'+(decision.action==='scan'?'screener.yml':'pages.yml')+'/dispatches',{ref:'main'});
    else decision.status='waiting';
   }
  }else if(!token&&decision.dates.some(p=>p.delayed))decision.status='configuration_required';
  const state={schemaVersion:1,checkedAt:now.toISOString(),status:decision.status,dates:decision.dates};
  await db('screener_watchdog_state',{key:'latest',payload:state});
  return response(state);
 }catch(error){
  // Do not store upstream URLs, response bodies, or credentials in public status.
  const status=/Scheduler HTTP (401|403)/.test(error.message)?'scheduler_unauthorized':'check_failed';
  try{const previous=await db('screener_watchdog_state?key=eq.latest&select=payload');await db('screener_watchdog_state',{key:'latest',payload:{...previous?.[0]?.payload,schemaVersion:1,attemptedAt:new Date().toISOString(),status}});}catch{}
  return response({status},503);
 }
});
