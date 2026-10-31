const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const number=(v,d=0)=>Number.isFinite(v)?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:d}).format(v):'—';
const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
export async function initMarket(config){
 let payload,active='FUT',busy=false,selected=null;
 function svg(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;}
 function draw(){
  const m=payload?.markets?.[active],host=$('flow-chart');host.replaceChildren();
  document.querySelectorAll('[data-flow-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.flowMarket===active)));
  if(!['ok','stale'].includes(m?.status)){host.append(el('p','현재 제공처의 수급 자료를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.','research-empty'));return;}
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
 async function load(){if(busy)return;busy=true;$('flow-refresh').disabled=true;let live=false;
  try{const headers={apikey:config.supabase.publishableKey,Authorization:'Bearer '+config.supabase.edgeAnonKey};const r=await fetch(config.supabase.url+'/functions/v1/market-flow',{headers,cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(!Object.values(d.markets||{}).some(m=>m.status==='ok'))throw Error();payload=d;live=true;}catch{if(!payload){try{const r=await fetch('./data/market.json');if(r.ok)payload=await r.json();}catch{}}}
  $('flow-updated').textContent=payload?`${live?'수집':'마지막 저장 자료'} ${new Date(payload.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST · 접속 중 1분마다 확인`:'수급 자료를 불러오지 못했습니다.';
  $('flow-warning').hidden=live;$('flow-warning').textContent='실시간 제공처 연결이 지연되어 마지막 저장 자료를 표시합니다.';draw();busy=false;$('flow-refresh').disabled=false;
 }
 document.querySelectorAll('[data-flow-market]').forEach(b=>b.onclick=()=>{active=b.dataset.flowMarket;selected=null;draw();});$('flow-refresh').onclick=load;
 await load();setInterval(()=>{if(!document.hidden)load();},60000);
}
