import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE);
const bundle = await build({stdin: {resolveDir: process.cwd(), contents: `
import {guideView} from './chart-guide.js';
import {analyzeStrategy} from './strategy-core.mjs';
import {priceCrosshair} from './chart-crosshair.js';
window.renderGuide = (currency,frame,width) => {
 const bars=Array.from({length:260},(_,index)=>{const close=(currency==='USD'?80:80000)+index*(currency==='USD'?.05:50);return {asOf:new Date(Date.UTC(2025,0,index+1)).toISOString(),open:close,close,high:close*1.01,low:close*.99,volume:1000};});
 const data={market:currency==='KRW'?'KR':currency==='JPY'?'JP':'US',symbol:currency,currency,bars,guide:analyzeStrategy(bars),frameInfo:{timeframe:frame==='daily'?'1d':'4h',timezone:'Asia/Seoul'}};
 document.querySelector('main').replaceChildren(guideView(data,{frame,width,height:600}));
};
window.renderMini=()=>{document.querySelector('main').innerHTML='<svg viewBox="0 0 300 100" style="width:300px;height:200px"><path d="M 10 90 L 290 10" stroke="blue"/></svg>';priceCrosshair(document.querySelector('svg'),{left:10,right:290,top:10,bottom:90,min:-10,max:10,format:value=>value.toFixed(2)+'%'});};
`}, bundle: true, write: false, format: 'iife'});
const css = await readFile('chart-guide.css', 'utf8');
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 for (const width of [1440,390,320]) {
  const page = await browser.newPage({viewport: {width, height: 950}, hasTouch: true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<style>body{margin:0}.chart-guide{padding:0!important}main{max-width:100%}</style><main class="stock-chart"></main>');
  await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
  for (const currency of ['KRW','USD','JPY']) for (const frame of ['daily','fourHour']) {
   await page.evaluate(args=>window.renderGuide(...args),[currency,frame,width]);
   const plot=page.locator('svg'),cross=page.locator('[data-price-crosshair]');
   await plot.scrollIntoViewIfNeeded();
   assert.equal(await cross.getAttribute('visibility'),'hidden');
   const geometry=await plot.evaluate(svg=>{const line=svg.querySelector('[data-price-crosshair-line]'),axis=svg.querySelector('[data-price-axis]');return {left:Number(line.getAttribute('x1')),right:Number(line.getAttribute('x2')),top:Number(axis.getAttribute('y')),bottom:Number(axis.getAttribute('y'))+Number(axis.getAttribute('height'))};});
   const box=await plot.boundingBox(),point={x:box.x+(geometry.left+geometry.right)/2,y:box.y+geometry.top+(geometry.bottom-geometry.top)*.37};
   await page.mouse.move(point.x,point.y);
   assert.equal(await cross.getAttribute('visibility'),'visible');
   const state=await plot.evaluate(svg=>({min:Number(svg.dataset.priceMin),max:Number(svg.dataset.priceMax),value:Number(svg.querySelector('[data-price-crosshair]').dataset.priceValue),lineY:Number(svg.querySelector('[data-price-crosshair-line]').getAttribute('y1')),label:svg.querySelector('[data-price-crosshair-label]').textContent}));
   assert.ok(Math.abs(state.value-(state.max-(state.max-state.min)*.37))<.001);
   assert.ok(Math.abs(state.lineY-(point.y-box.y))<.001);
   assert.match(state.label,currency==='USD'?/\.\d{2}$/:/^[\d,]+$/);
   await page.mouse.move(0,0);assert.equal(await cross.getAttribute('visibility'),'hidden');
   await page.touchscreen.tap(point.x,point.y);assert.equal(await cross.getAttribute('visibility'),'visible');
   const afterTap=await plot.boundingBox();await page.mouse.move(afterTap.x+(geometry.left+geometry.right)/2,afterTap.y+geometry.bottom+40);assert.equal(await cross.getAttribute('visibility'),'hidden',JSON.stringify({width,currency,frame,box,afterTap,interacting:await page.locator('.chart-guide').getAttribute('data-interacting')}));
   await plot.focus();await page.keyboard.press('Home');assert.equal(await cross.getAttribute('visibility'),'visible');
   const axis=page.locator('[data-price-axis]');await axis.focus();await page.keyboard.press('ArrowUp');
   const scaledBox=await plot.boundingBox();await page.mouse.move(scaledBox.x+(geometry.left+geometry.right)/2,scaledBox.y+geometry.top+(geometry.bottom-geometry.top)*.5);
   const scaled=await plot.evaluate(svg=>({min:Number(svg.dataset.priceMin),max:Number(svg.dataset.priceMax),value:Number(svg.querySelector('[data-price-crosshair]').dataset.priceValue)}));
   assert.ok(Math.abs(scaled.value-(scaled.min+scaled.max)/2)<.001);
  }
  await page.screenshot({path:'outputs/chart-crosshair-'+width+'.png'});
  await page.evaluate(()=>window.renderMini());
  const mini=page.locator('svg'),bounds=await mini.boundingBox();
  await page.mouse.move(bounds.x+150,bounds.y+50+30);
  assert.equal(await page.locator('[data-price-crosshair-label]').textContent(),'5.00%');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS crosshair: KR/US/JP, daily/4h, mouse/touch/keyboard, price scaling, volume exclusion, letterboxed SVG, 1440/390/320');
} finally {await browser.close();}
