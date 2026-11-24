import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Use the exact upload output rather than deploy-pages' separate artifact-list
// service, which has returned an empty list after successful uploads.
export async function deployPages({env=process.env,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const {GITHUB_TOKEN:token,GITHUB_REPOSITORY:repo,GITHUB_RUN_ID:run,GITHUB_SHA:sha,PAGES_ARTIFACT_ID:artifactId}=env;
 if(!token||!/^\w[\w.-]*\/[\w.-]+$/.test(repo||'')||!/^\d+$/.test(artifactId||'')||!Number.isSafeInteger(Number(artifactId)))throw Error('Missing Pages deployment configuration');
 const secrets=[token,env.ACTIONS_ID_TOKEN_REQUEST_TOKEN].filter(Boolean);
 const base=`https://api.github.com/repos/${repo}`,headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const request=async(url,options={})=>{
  const r=await fetcher(url,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(20000)});
  if(!r.ok){const body=await r.json().catch(()=>({}));let detail=JSON.stringify({message:body.message,errors:body.errors});for(const secret of secrets)detail=detail.replaceAll(secret,'[redacted]');throw Error('Pages API HTTP '+r.status+' '+detail.slice(0,600));}return r.json();
 };
 let artifact;
 for(let attempt=0;attempt<6;attempt++){
  const r=await fetcher(`${base}/actions/artifacts/${artifactId}`,{headers,signal:AbortSignal.timeout(20000)});
  if(r.ok){artifact=await r.json();break;}
  if(r.status!==404)throw Error('Artifact API HTTP '+r.status);
  await sleep(5000);
 }
 if(!artifact||String(artifact.workflow_run?.id)!==String(run)||artifact.expired)throw Error('Uploaded artifact is not ready or belongs to a different run');
 const oidcURL=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);oidcURL.searchParams.set('audience','https://github.com/'+repo.split('/')[0]);
 const oidc=await fetcher(oidcURL,{headers:{Authorization:'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(20000)});
 if(!oidc.ok)throw Error('Pages identity request failed');
 const idToken=(await oidc.json()).value;if(!idToken)throw Error('Pages identity missing');
 secrets.push(idToken);
 const deployment=await request(`${base}/pages/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({artifact_id:Number(artifactId),pages_build_version:sha,oidc_token:idToken})});
 if(!deployment.id)throw Error('Pages deployment ID missing');
 for(let attempt=0;attempt<60;attempt++){
  const status=await request(`${base}/pages/deployments/${deployment.id}`);
  if(status.status==='succeed')return deployment.page_url;
  if(['errored','failed','cancelled','deployment_failed','deployment_cancelled','deployment_content_failed'].includes(status.status))throw Error('Pages deployment '+status.status);
  await sleep(5000);
 }
 throw Error('Pages deployment did not finish within five minutes');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const url=await deployPages();if(!url)throw Error('Pages URL missing');
 if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'page_url='+url+'\n');
 console.log('Pages deployment succeeded:',url);
}
