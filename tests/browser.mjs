import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const url='http://127.0.0.1:5183/preview/';
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
// Keep the unconfigured-state test independent of the deployment's real config.
await page.route('**/site.config.json',route=>route.fulfill({json:{title:'투자노트',supabase:{url:'',publishableKey:''}}}));
await page.goto(url);await page.locator('#member-status').filter({hasText:'서비스 연결 후'}).waitFor();
assert.equal(await page.locator('#signin').isDisabled(),true);assert.equal(await page.locator('#save-entry').isDisabled(),true);
assert.equal(await page.locator('#chart>iframe').getAttribute('sandbox'),'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
await page.selectOption('#market-select','KRX:KOSPI');assert.equal(await page.locator('#chart-heading').textContent(),'국내 · 코스피');assert.equal(await page.locator('.chart-unavailable a').getAttribute('href'),'https://finance.naver.com/sise/sise_index.naver?code=KOSPI');await page.selectOption('#market-select','FOREXCOM:NSXUSD');
await mkdir('outputs',{recursive:true});await page.screenshot({path:'outputs/desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'outputs/mobile.png',fullPage:true});
// Check the real SDK and UI against a controlled REST endpoint. Server policy is tested separately against PostgreSQL.
const context=await browser.newContext({viewport:{width:1300,height:900}});
const id='11111111-1111-4111-8111-111111111111',expires=Math.floor(Date.now()/1000)+3600;
const jwt=[{alg:'HS256',typ:'JWT'},{sub:id,exp:expires,role:'authenticated',aud:'authenticated'}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.test';
await context.addInitScript(({id,expires,jwt})=>{if(location.origin!=='http://127.0.0.1:5183')return;localStorage.setItem('sb-sample-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test-refresh',token_type:'bearer',expires_at:expires,expires_in:3600,user:{id,aud:'authenticated',role:'authenticated',email:'test@example.test',app_metadata:{provider:'github'},user_metadata:{},created_at:new Date().toISOString()}}));},{id,expires,jwt});
let entries=[],comments=[];
await context.route('**/site.config.json',route=>route.fulfill({json:{title:'투자노트',supabase:{url:'https://sample.supabase.co',publishableKey:'sb_publishable_testing_only',authProvider:'github'}}}));
await context.route('https://sample.supabase.co/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
  if(method==='OPTIONS')return route.fulfill({status:204});
  if(path.includes('/logout'))return route.fulfill({status:204});
  const collection=path.includes('investment_entries')?entries:comments;
  if(method==='GET')return route.fulfill({json:collection});
  if(method==='POST'){collection.push({...request.postDataJSON(),id:'33333333-3333-4333-8333-333333333333',created_at:new Date().toISOString()});return route.fulfill({status:201,json:null});}
  if(method==='PATCH'){Object.assign(collection[0],request.postDataJSON());return route.fulfill({status:204});}
  if(method==='DELETE'){collection.splice(0,1);return route.fulfill({status:204});}
  throw Error('Unexpected mock request '+path+' '+method);
});
const member=await context.newPage();member.on('pageerror',e=>errors.push(e.message));member.on('dialog',dialog=>dialog.accept());
await member.goto(url);await member.locator('#account-label').filter({hasText:'로그인됨'}).waitFor();
await member.locator('[name="stock_name"]').fill('Apple');await member.locator('[name="symbol"]').fill('AAPL');await member.locator('[name="market"]').selectOption('US');await member.locator('[name="quantity"]').fill('2');await member.locator('[name="price"]').fill('200');await member.locator('[name="reason"]').fill('<img src=x onerror="window.XSS=true">');await member.locator('#save-entry').click();
await member.locator('.entry-card').waitFor();assert.equal(await member.locator('.entry-card img').count(),0);assert.equal(entries.length,1);
await member.getByRole('button',{name:'수정',exact:true}).click();await member.locator('[name="review"]').fill('기록을 수정합니다');await member.locator('#save-entry').click();await member.locator('.entry-card').filter({hasText:'기록을 수정합니다'}).waitFor();
await member.locator('[name="nickname"]').fill('투자자');await member.locator('[name="body"]').fill('공개 의견 테스트');await member.locator('#save-comment').click();await member.locator('.comment').filter({hasText:'공개 의견 테스트'}).waitFor();assert.equal(await member.locator('[name="body"]').inputValue(),'');
await member.getByRole('button',{name:'내 댓글 삭제',exact:true}).click();await member.waitForFunction(()=>!document.querySelector('.comment'));
await member.getByRole('button',{name:'삭제',exact:true}).click();await member.waitForFunction(()=>!document.querySelector('.entry-card'));assert.equal(entries.length,0);
await member.locator('#signout').click();await member.locator('#account-label').filter({hasText:'로그인 후'}).waitFor();assert.equal(await member.locator('#save-entry').isDisabled(),true);assert.equal(await member.locator('[name="stock_name"]').inputValue(),'');
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: unconfigured state, desktop/mobile layout, market switch, SDK-backed mocked journal CRUD, public comment create/delete, XSS text rendering, logout cleanup. Live OAuth/database still requires configured services.');
