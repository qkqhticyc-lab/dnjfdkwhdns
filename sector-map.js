import {SECTORS} from './sector-core.mjs';
import {sectorRectangles} from './live-sector-core.mjs';
import {formatPrice} from './price-display.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const pct=n=>Number.isFinite(n)?(n>0?'+':'')+n.toFixed(2)+'%':'—';
const tone=n=>n>0?'sector-positive':n<0?'sector-negative':'';
const time=at=>Number.isFinite(Date.parse(at))?new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' KST':'시각 미제공';
const turnover=(n,m)=>Number.isFinite(n)?(n/(m==='KR'?1e8:1e6)).toLocaleString('ko-KR',{maximumFractionDigits:1})+(m==='KR'?'억원':'백만 USD'):'—';
export function sectorColor(n){const strength=Math.min(1,Math.abs(n)/4),base=[241,244,244],color=n>=0?[229,83,105]:[67,126,218];return 'rgb('+base.map((v,i)=>Math.round(v+(color[i]-v)*strength)).join(',')+')';}
export async function initSectorMap(config){
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);let market=params.get('market')==='KR'?'KR':'US',selected=params.get('sector')||'technology',summary=null,busy=false,shown=50;
 const summaries=new Map(),stockCache=new Map(),pending=new Set();
 $('sector-market').value=market;
 async function json(query){const r=await fetch(config.supabase.url+'/functions/v1/market-sectors?'+new URLSearchParams(query),{headers:{apikey:config.supabase.publishableKey,Authorization:'Bearer '+config.supabase.edgeAnonKey},cache:'no-store',signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error();const d=await r.json();if(d.schemaVersion!==1||d.market!==query.market)throw Error();return d;}
 function url(){const u=new URL(location.href);u.searchParams.set('market',market);u.searchParams.set('sector',selected);history.replaceState(null,'',u);$('sector-back').href='./lounge.html?market='+market;}
 function choose(id){selected=id;shown=50;$('sector-stock-query').value='';url();draw();$('sector-treemap').querySelector('[aria-pressed=true]')?.focus({preventScroll:true});loadStocks();}
 function draw(){
  if(!summary)return;$('sector-explanation').textContent=market==='US'?'장중 자료는 5분 간격으로 집계하며 제공처 지연이 있을 수 있습니다. 미국 업종은 S&P 500 업종 ETF로 비교합니다. 관련 종목은 미국 상장 종목의 업종 분류 기준이며 ETF 편입 명단과는 다릅니다.':'장중 자료는 5분 간격으로 집계하며 제공처 지연이 있을 수 있습니다. 국내 제공업종을 공통 업종으로 묶고, 각 제공업종의 등락률을 종목 수로 가중한 흐름입니다.';const valid=summary.sectors.filter(p=>p.status==='ok'&&Number.isFinite(p.changePercent)),weights=valid.map(p=>({...p,weight:summary.sizeBasis==='turnover'?p.turnover:p.count})).filter(p=>p.weight>0),map=$('sector-treemap'),width=Math.max(240,map.clientWidth||1000),height=map.clientHeight||410,rects=sectorRectangles(weights,width,height);map.replaceChildren();
  for(const row of rects){const button=el('button',null,'sector-tile'+(row.w<95||row.h<65?' is-small':''));button.type='button';button.style.cssText=`left:${row.x/width*100}%;top:${row.y/height*100}%;width:${row.w/width*100}%;height:${row.h/height*100}%;background:${sectorColor(row.changePercent)}`;button.setAttribute('aria-pressed',String(row.id===selected));button.setAttribute('aria-label',row.name+' '+pct(row.changePercent));button.title=row.name+' '+pct(row.changePercent);button.append(el('b',row.name),el('span',pct(row.changePercent)));button.onclick=()=>choose(row.id);map.append(button);}
  const basisAt=valid.map(p=>p.quoteAt).filter(Boolean).sort()[0]||summary.collectedAt;
  $('sector-basis').textContent=(market==='US'?'S&P 500 업종 ETF':'한국 업종 묶음')+' · '+(summary.sessionDate||'거래일 확인 중')+' '+(summary.marketStatus==='OPEN'?'장중':summary.marketStatus==='CLOSE'?'최근 마감':'장 상태 확인 중')+' · '+time(basisAt)+' 기준 · 5분마다 집계';
  const legend=$('sector-legend');legend.replaceChildren(el('span',(market==='US'?'크기 = 업종 ETF 거래대금 · 색 = 당일 등락':'크기 = 제공업종 종목 수 · 색 = 업종 등락률의 종목 수 가중 평균')));
  for(const row of summary.sectors.filter(p=>!weights.some(w=>w.id===p.id))){const b=el('button',row.name+' · 자료 확인 중');b.type='button';b.onclick=()=>choose(row.id);legend.append(b);}
  const row=summary.sectors.find(p=>p.id===selected),detail=$('sector-detail');detail.replaceChildren(el('h2',row?.name||SECTORS[selected]||'업종'),el('p',row?.symbol?row.symbol+' · '+(row.status==='ok'?'현재 제공 시세':'시세 갱신 지연'):'국내 제공업종을 공통 업종으로 묶은 흐름'));
  const metrics=el('div',null,'sector-metrics'),total=valid.reduce((s,p)=>s+(p.turnover||0),0),relative=row?.status==='ok'&&Number.isFinite(summary.benchmark?.changePercent)?row.changePercent-summary.benchmark.changePercent:null;
  const metric=(label,value,cls)=>{const box=el('div',null,'sector-metric');box.append(el('small',label),el('strong',value,cls));metrics.append(box);};
  metric('오늘 등락',row?.status==='ok'?pct(row.changePercent):'—',tone(row?.changePercent));metric('시장 대비 · '+(market==='US'?'SPY':'코스피'),relative==null?'—':(relative>0?'+':'')+relative.toFixed(2)+'%p',tone(relative));
  metric(market==='US'?'ETF 거래대금':'제공업종 종목 수',market==='US'?turnover(row?.turnover,market):(row?.count||0).toLocaleString()+'개');metric(market==='US'?'업종 ETF 거래대금 비중':'포함된 세부 업종',market==='US'&&total>0&&Number.isFinite(row?.turnover)?(row.turnover/total*100).toFixed(1)+'%':market==='KR'?(row?.groups?.length||0)+'개':'—');detail.append(metrics);
  if(row?.quoteAt)detail.append(el('p','시세 '+time(row.quoteAt)+(row.delayMinutes>0?' · '+row.delayMinutes+'분 지연':''),'sector-note'));
  if(summary.sectors.some(p=>p.status!=='ok'))detail.append(el('p','일부 업종은 시세 갱신을 기다리고 있습니다.','sector-note'));
  $('sector-stock-title').textContent=(row?.name||SECTORS[selected]||'업종')+' 관련 종목';drawStocks();
 }
 function drawStocks(){
  const key=market+':'+selected,d=stockCache.get(key),host=$('sector-stock-list');host.replaceChildren();$('sector-stock-more').hidden=true;
  if(!d){host.append(el('p',pending.has(key)?'현재 종목 시세를 불러오고 있습니다.':'종목 자료를 불러오지 못했습니다. 다시 조회해 주세요.','sector-empty'));$('sector-stock-basis').textContent='';return;}
  const query=$('sector-stock-query').value.trim().toLowerCase(),sort=$('sector-stock-sort').value,rows=d.items.filter(p=>!query||[p.symbol,p.name].some(s=>s.toLowerCase().includes(query))).sort((a,b)=>sort==='up'?b.changePercent-a.changePercent:sort==='down'?a.changePercent-b.changePercent:(b.turnover??-1)-(a.turnover??-1));
  $('sector-stock-basis').textContent=(market==='US'?'미국 상장 제공목록':'국내 업종 제공목록')+' · 현재 거래일 '+rows.length.toLocaleString()+'종목 · '+time(d.collectedAt)+' 조회'+(d.partial?' · 일부 제공목록 연결 지연':'');
  for(const p of rows.slice(0,shown)){const link=el('a',null,'sector-stock'+(p.status==='stale'?' is-stale':''));link.href='./charts.html?'+new URLSearchParams({market:p.market,symbol:p.symbol,name:p.name,currency:p.currency,exchange:p.exchange});
   const info=el('div',null,'sector-stock-info'),value=el('div',null,'sector-stock-value');info.append(el('b',market==='US'?p.symbol:p.name),el('small',(market==='US'?p.name+' · ':'')+turnover(p.turnover,market)),el('small',time(p.quoteAt)+(p.status==='stale'?' · 이전 거래일 시세':'')));value.append(el('span',pct(p.changePercent),tone(p.changePercent)),el('small',formatPrice(p.price,p.currency)+' '+p.currency));link.append(info,value);host.append(link);}
  if(!rows.length)host.append(el('p','표시할 종목이 없습니다.','sector-empty'));
  $('sector-stock-more').hidden=shown>=rows.length;$('sector-stock-more').textContent='더보기 ('+Math.min(shown,rows.length)+'/'+rows.length+')';
 }
 async function loadStocks(force=false){const m=market,id=selected,key=m+':'+id,cached=stockCache.get(key);if(pending.has(key)||!force&&cached&&Date.now()-Date.parse(cached.collectedAt)<300000){drawStocks();return;}pending.add(key);drawStocks();try{const d=await json({market:m,sector:id});if(!Array.isArray(d.items))throw Error();stockCache.set(key,d);}catch{const d=stockCache.get(key);if(d)stockCache.set(key,{...d,partial:true});}finally{pending.delete(key);if(m===market&&id===selected)drawStocks();}}
 async function load(force=false){if(busy)return;busy=true;$('sector-refresh').disabled=true;const m=market;try{const old=summaries.get(m);const d=!force&&old&&Date.now()-Date.parse(old.collectedAt)<300000?old:await json({market:m});if(!Array.isArray(d.sectors)||!d.sectors.length)throw Error();summaries.set(m,d);if(m!==market)return;summary=d;if(!d.sectors.some(p=>p.id===selected))selected=d.sectors[0].id;url();draw();loadStocks(force);}catch{if(m===market)$('sector-basis').textContent='업종 자료 연결 지연'+(summary?' · '+summary.sessionDate+' · '+time(summary.collectedAt)+' 조회 자료 유지':' · 다시 조회해 주세요.');}finally{busy=false;$('sector-refresh').disabled=false;if(m!==market)load();}}
 $('sector-market').onchange=()=>{market=$('sector-market').value;summary=summaries.get(market)||null;selected='technology';shown=50;$('sector-stock-list').replaceChildren();$('sector-treemap').replaceChildren();$('sector-detail').replaceChildren();$('sector-basis').textContent='현재 업종 자료를 확인하고 있습니다.';url();load();};
 $('sector-refresh').onclick=()=>load(true);$('sector-stock-query').oninput=()=>{shown=50;drawStocks();};$('sector-stock-sort').onchange=()=>{shown=50;drawStocks();};$('sector-stock-more').onclick=()=>{shown+=50;drawStocks();};
 let resize;new ResizeObserver(()=>{clearTimeout(resize);resize=setTimeout(()=>{if(summary)draw();},80);}).observe($('sector-treemap'));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});setInterval(()=>{if(!document.hidden)load();},60000);url();await load();
}
