const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const number=(v,d=0)=>Number.isFinite(v)?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:d}).format(v):'—';
const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
export async function initMarket(config){
 let payload={markets:{}},active='FUT',selected=null,options;const pending=new Map();let optionsBusy=false;
 const headers={apikey:config.supabase.publishableKey,Authorization:'Bearer '+config.supabase.edgeAnonKey};
 function svg(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;}
 function draw(){
  const m=payload?.markets?.[active],host=$('flow-chart');host.replaceChildren();
  document.querySelectorAll('[data-flow-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.flowMarket===active)));
  $('flow-refresh').disabled=pending.has(active);
  $('flow-updated').textContent=m?.collectedAt?`조회 ${new Date(m.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST · 접속 중 30초마다 확인`:'';
  const old=m?.status==='stale'||(m?.collectedAt&&Date.now()-Date.parse(m.collectedAt)>90000);
  $('flow-warning').hidden=!old;$('flow-warning').textContent='최신 조회가 지연되어 이전 자료를 표시합니다. 차트의 거래일·시간을 확인해 주세요.';
  if(!['ok','stale'].includes(m?.status)||!m.points?.length||!m.prices?.length){for(const id of ['flow-net','flow-index'])$(id).textContent='—';for(const id of ['flow-delta','flow-index-change','flow-selection'])$(id).textContent='';$('flow-caption').textContent='';$('flow-slider').disabled=true;host.append(el('p',pending.has(active)?'선택한 시장의 수급을 확인하고 있습니다.':'현재 제공처의 수급 자료를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.','research-empty'));return;}
  $('flow-slider').disabled=false;
  const points=m.points,first=minute(points[0].time),last=minute(points.at(-1).time),prices=m.prices.filter(p=>minute(p.time)>=first&&minute(p.time)<=last);
  if(!prices.length){host.append(el('p','같은 시간대의 지수 자료가 없습니다.','research-empty'));return;}
  const current=selected==null?points.at(-1):points[Math.min(selected,points.length-1)];
  const before=points.filter(p=>minute(p.time)<=minute(current.time)-30).at(-1),price=prices.filter(p=>p.time<=current.time).at(-1);
  $('flow-net-name').textContent=`외국인 ${active==='FUT'?'K200 선물':' '+m.name+' 현물'} 순매수 누적`;
  $('flow-net').textContent=`${current.foreignNet>0?'+':''}${number(current.foreignNet,1)}${m.unit}`;
  $('flow-net').className=current.foreignNet>=0?'up':'down';
  $('flow-delta').textContent=before?`30분 변화 ${current.foreignNet-before.foreignNet>0?'+':''}${number(current.foreignNet-before.foreignNet,1)}${m.unit}`:'30분 전 수급 자료 없음';
  $('flow-index-name').textContent=m.name;$('flow-index').textContent=number(price?.price??m.price,2);
  const change=price&&m.previousClose?(price.price/m.previousClose-1)*100:m.changePercent;
  $('flow-index-change').textContent=`전일 대비 ${change>0?'+':''}${number(change,2)}% · ${m.date} 지수 ${price?.time||''}`;
  $('flow-caption').textContent=`${m.date} · ${points[0].time}~${points.at(-1).time} · 외국인 누적 수급(빨강·오른쪽 ${m.unit}) / 지수(회색·왼쪽). 두 축은 각각의 범위로 표시합니다.`;
  $('flow-selection').textContent=`선택 ${current.time} · 외국인 ${number(current.foreignNet,1)}${m.unit} · 지수 ${number(price?.price,2)}`;
  const W=1000,H=430,left=76,right=900,top=28,bottom=365;
  let pmin=Math.min(...prices.map(p=>p.price)),pmax=Math.max(...prices.map(p=>p.price)),fmin=Math.min(0,...points.map(p=>p.foreignNet)),fmax=Math.max(0,...points.map(p=>p.foreignNet));
  const pp=(pmax-pmin||1)*.1,fp=(fmax-fmin||1)*.1;pmin-=pp;pmax+=pp;fmin-=fp;fmax+=fp;
  const x=t=>left+(minute(t)-first)/Math.max(1,last-first)*(right-left),yp=v=>bottom-(v-pmin)/(pmax-pmin)*(bottom-top),yf=v=>bottom-(v-fmin)/(fmax-fmin)*(bottom-top);
  const chart=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':`${m.name} 외국인 누적 수급과 지수 교차 차트`});
  for(let i=0;i<=4;i++){const y=top+(bottom-top)*i/4;chart.append(svg('line',{x1:left,y1:y,x2:right,y2:y,stroke:'#e2e7e3'}),svg('text',{x:left-10,y:y+5,'text-anchor':'end',fill:'#718078','font-size':14},number(pmax-(pmax-pmin)*i/4,2)),svg('text',{x:right+12,y:y+5,fill:'#b63b3e','font-size':14},number(fmax-(fmax-fmin)*i/4)));}
  for(let i=0;i<=4;i++){const t=first+(last-first)*i/4,label=String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');chart.append(svg('text',{x:left+(right-left)*i/4,y:bottom+30,'text-anchor':'middle',fill:'#718078','font-size':14},label));}
  chart.append(svg('line',{x1:left,y1:yf(0),x2:right,y2:yf(0),stroke:'#e6a0a0','stroke-dasharray':'5 5'}));
  const path=(list,key,y)=>list.map((p,i)=>`${i?'L':'M'}${x(p.time).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
  chart.append(svg('path',{d:path(prices,'price',yp),fill:'none',stroke:'#60696d','stroke-width':2.4}),svg('path',{d:path(points,'foreignNet',yf),fill:'none',stroke:'#d63b3d','stroke-width':3}));
  chart.append(svg('circle',{cx:x(current.time),cy:yf(current.foreignNet),r:5,fill:'#d63b3d'}));
  chart.onclick=e=>{const bounds=chart.getBoundingClientRect(),at=first+((e.clientX-bounds.left)/bounds.width*W-left)/(right-left)*(last-first);selected=points.reduce((best,p,i)=>Math.abs(minute(p.time)-at)<Math.abs(minute(points[best].time)-at)?i:best,0);draw();};
  host.append(chart);const slider=$('flow-slider');slider.max=String(points.length-1);slider.value=String(selected??points.length-1);slider.oninput=()=>{selected=Number(slider.value);draw();};
 }
 function accept(code,m,collectedAt){if(!['ok','stale'].includes(m?.status)||!m.points?.length||!m.prices?.length||m.unit!=='억원'||m.measure!=='netAmount')return false;const old=payload.markets[code],stamp=m.date+m.points.at(-1).time,oldStamp=old?.date+(old?.points?.at(-1)?.time||'');if(old&&stamp<oldStamp)return false;payload.markets[code]={...m,collectedAt:m.collectedAt||collectedAt};return true;}
 async function load(code=active){if(pending.has(code))return pending.get(code);
  const promise=(async()=>{try{const r=await fetch(config.supabase.url+'/functions/v1/market-flow?market='+code,{headers,cache:'no-store',signal:AbortSignal.timeout(16000)});if(!r.ok)throw Error();const d=await r.json();if(!accept(code,d.markets?.[code],d.collectedAt))throw Error();}catch{if(payload.markets[code])payload.markets[code].status='stale';}finally{pending.delete(code);if(code===active)draw();}})();pending.set(code,promise);if(code===active)draw();return promise;
 }
 function drawOptions(){const host=$('options-data');host.replaceChildren();if(!['ok','stale'].includes(options?.status)){host.append(el('p','콜·풋 수급을 불러오지 못했습니다. 다음 자동 갱신 때 다시 확인합니다.'));return;}const table=el('table'),caption=el('caption','KOSPI200 옵션 투자자별 누적 순매수 · 억원'),head=el('thead'),tr=el('tr');for(const name of ['시장','외국인','개인','기관']){const th=el('th',name);th.scope='col';tr.append(th);}head.append(tr);table.append(caption,head);const body=el('tbody');for(const item of options.items){const row=el('tr'),th=el('th',item.code==='CALL'?'콜옵션':'풋옵션');th.scope='row';row.append(th);for(const k of ['foreignNet','personalNet','institutionNet'])row.append(el('td',(item[k]>0?'+':'')+number(item[k],2),item[k]>=0?'up':'down'));body.append(row);}table.append(body);host.append(table,el('p',(options.status==='stale'?'이전 조회 자료 · ':'')+options.message,'research-footnote'));const link=el('a','대신증권 원자료 ↗');link.href=options.source;link.target='_blank';link.rel='noopener noreferrer';host.append(link,el('p',`조회 ${new Date(options.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST · 1분마다 확인 · 조회 시각은 거래 시각이 아닙니다.`,'research-footnote'));}
 async function loadOptions(){if(optionsBusy)return;optionsBusy=true;try{const r=await fetch(config.supabase.url+'/functions/v1/market-flow?options=1',{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const d=await r.json();if(!['ok','stale'].includes(d.status)||d.items?.length!==2||d.items.some(i=>!['CALL','PUT'].includes(i.code)||!Number.isFinite(i.foreignNet)))throw Error();options=d;}catch{if(options)options.status='stale';}finally{optionsBusy=false;drawOptions();}}
 document.querySelectorAll('[data-flow-market]').forEach(b=>b.onclick=()=>{active=b.dataset.flowMarket;selected=null;draw();load(active);});$('flow-refresh').onclick=()=>{load(active);loadOptions();};
 // Paint the saved chart independently of the live request. It is always labeled with its own timestamp.
 const snapshot=fetch('./data/market.json',{signal:AbortSignal.timeout(5000)}).then(r=>r.json()).then(d=>{for(const [code,m]of Object.entries(d.markets||{}))if(!payload.markets[code])accept(code,{...m,status:'stale'},d.collectedAt);draw();}).catch(()=>{});
 await Promise.all([load(),loadOptions(),snapshot]);setInterval(()=>{if(!document.hidden)load();},30000);setInterval(()=>{if(!document.hidden)loadOptions();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){load();loadOptions();}});
}
