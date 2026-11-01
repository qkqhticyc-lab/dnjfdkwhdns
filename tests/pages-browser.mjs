import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const base=process.env.TEST_SITE_URL||'http://127.0.0.1:5183/preview/';
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#flow-chart path').first().waitFor();
 assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('#entry-form').count(),0);
 assert.ok((await page.locator('#flow-net').textContent()).includes('억원'));
 assert.ok(!(await page.locator('#flow-caption').textContent()).includes('계약'));
 assert.equal(await page.locator('.brand b').textContent(),'부자가 되어보자...');
 await page.locator('[data-flow-market="KOSDAQ"]').click();assert.ok((await page.locator('#flow-net').textContent()).includes('억원'));
 await page.locator('#flow-slider').fill('20');assert.ok((await page.locator('#flow-selection').textContent()).includes('선택'));
 await page.screenshot({path:'outputs/market-flow-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'outputs/market-flow-mobile.png',fullPage:true});
 const privateLink=await page.locator('header nav [data-private]').getAttribute('href');assert.ok(privateLink.includes('my-investment-journal-oct31'));assert.equal(await page.locator('header nav [data-private]').getAttribute('target'),null);
 await page.getByRole('link',{name:'리포트',exact:true}).click();await page.locator('.research-row').first().waitFor();assert.ok(page.url().endsWith('reports.html'));assert.equal(await page.locator('#flow-chart').count(),0);
 await page.getByRole('link',{name:'당신들의 반성일기',exact:true}).click();await page.locator('#shared-posts .empty-message').waitFor();assert.ok(page.url().endsWith('journals.html'));assert.equal(await page.locator('#post-save').isDisabled(),true);assert.equal(await page.locator('[name="quantity"],[name="price"]').count(),0);
 const context=await browser.newContext();const id='11111111-1111-4111-8111-111111111111',exp=Math.floor(Date.now()/1000)+3600;
 const token=[{alg:'HS256',typ:'JWT'},{sub:id,exp,role:'authenticated',aud:'authenticated'}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.test';
 await context.addInitScript(({id,exp,token})=>localStorage.setItem('sb-lrmevhhdfmpnclomhsmz-auth-token',JSON.stringify({access_token:token,refresh_token:'test',token_type:'bearer',expires_at:exp,expires_in:3600,user:{id,aud:'authenticated',role:'authenticated',app_metadata:{provider:'github'},user_metadata:{}}})),{id,exp,token});
 const posts=[],comments=[];
 await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url());assert.ok(!url.pathname.includes('investment_entries'));
  const collection=url.pathname.includes('journal_post_comments')?comments:posts;
  if(req.method()==='GET')return route.fulfill({json:collection});
  if(req.method()==='POST'){const row=req.postDataJSON();for(const field of ['quantity','price','amount','account','balance'])assert.ok(!(field in row));collection.push({...row,owner_id:id,id:'33333333-3333-4333-8333-333333333333',source:'manual',created_at:new Date().toISOString()});return route.fulfill({status:201,json:null});}
  if(req.method()==='DELETE'){collection.splice(0,1);return route.fulfill({status:204});}
  if(req.method()==='PATCH'){Object.assign(collection[0],req.postDataJSON());return route.fulfill({status:204});}
 });
 const member=await context.newPage();member.on('pageerror',e=>errors.push(e.message));member.on('dialog',dialog=>dialog.accept());
 await member.goto(new URL('journals.html',base).href,{waitUntil:'domcontentloaded'});await member.locator('#post-save:not([disabled])').waitFor();
 const f=member.locator('#post-form');await f.locator('[name="nickname"]').fill('테스트');await f.locator('[name="stock_name"]').fill('테스트 종목');await f.locator('[name="symbol"]').fill('TEST');await f.locator('[name="trade_price"]').fill('70000.5');await f.locator('[name="reason"]').fill('<img src=x onerror="window.XSS=true">');await member.locator('#post-save').click();await member.locator('.shared-post').waitFor();assert.equal(await member.locator('.shared-post img').count(),0);assert.equal(posts[0].trade_price,70000.5);assert.equal(posts[0].price_currency,'KRW');assert.ok((await member.locator('.shared-trade-price').textContent()).includes('70,000.5원'));
 await member.getByRole('button',{name:'댓글 보기 · 의견 남기기'}).click();const comment=member.locator('.shared-post form');await comment.locator('[name="nickname"]').fill('다른 의견');await comment.locator('[name="body"]').fill('의견을 나눕니다.');await comment.getByRole('button',{name:'댓글 남기기'}).click();await member.locator('.comment').waitFor();assert.equal(comments.length,1);
 await member.getByRole('button',{name:'내 댓글 삭제'}).click();await member.waitForFunction(()=>!document.querySelector('.comment'));await member.getByRole('button',{name:'공개 글 삭제'}).click();await member.waitForFunction(()=>!document.querySelector('.shared-post'));
 assert.deepEqual(errors,[]);console.log('PASS: separate pages, same-tab navigation, real cash/futures charts and units, mobile width, no private form, shared posts/comments CRUD, public payload privacy, source XSS handling.');
}finally{await browser.close();}
