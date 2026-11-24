import test from 'node:test';import assert from 'node:assert/strict';
import {deployPages} from '../scripts/pages-deploy.mjs';
const env={GITHUB_TOKEN:'test-only',GITHUB_REPOSITORY:'owner/repo',GITHUB_RUN_ID:'12',GITHUB_SHA:'sha',PAGES_ARTIFACT_ID:'34',ACTIONS_ID_TOKEN_REQUEST_URL:'https://identity.example/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'identity-test'};
test('Pages deploy uses the exact uploaded artifact ID, tolerates propagation and awaits actual success',async()=>{
 let reads=0,polls=0,posts=0,waits=0;
 const fetcher=async(url,options={})=>{
  const s=String(url);assert.ok(!s.includes('test-only'));
  if(s.endsWith('/actions/artifacts/34'))return ++reads===1?new Response('',{status:404}):Response.json({workflow_run:{id:12},expired:false});
  if(s.startsWith('https://identity.example/'))return Response.json({value:'test-oidc'});
  if(options.method==='POST'){posts++;assert.deepEqual(JSON.parse(options.body),{artifact_id:34,pages_build_version:'sha',oidc_token:'test-oidc'});return Response.json({id:'deployment',page_url:'https://owner.github.io/repo/'});}
  if(s.endsWith('/pages/deployments/deployment'))return Response.json({status:++polls===1?'deployment_in_progress':'succeed'});
  throw Error('Unexpected request '+s);
 };
 assert.equal(await deployPages({env,fetcher,sleep:async()=>{waits++;}}),'https://owner.github.io/repo/');
 assert.equal(posts,1);assert.equal(waits,2);
});
test('Pages refuses another run artifact and does not report failed deployment as success',async()=>{
 let posts=0;
 const wrong=async()=>Response.json({workflow_run:{id:99}});
 await assert.rejects(deployPages({env,fetcher:wrong}),/different run/);
 const fetcher=async(url,options={})=>{
  if(String(url).includes('/actions/artifacts/'))return Response.json({workflow_run:{id:12}});
  if(String(url).includes('identity.example'))return Response.json({value:'test-oidc'});
  if(options.method==='POST'){posts++;return Response.json({id:'d',page_url:'https://owner.github.io/repo/'});}
  return Response.json({status:'deployment_failed'});
 };
 await assert.rejects(deployPages({env,fetcher}),/deployment_failed/);assert.equal(posts,1);
});
