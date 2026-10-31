import {creditRatio,creditWindow,validateCreditData} from './credit-core.mjs';
const $=id=>document.getElementById(id),money=n=>(n/10000).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+'조원',pct=n=>n.toFixed(2)+'%',dateText=s=>s.replaceAll('-','.'),signed=(n,unit)=>`${n>0?'+':''}${n.toLocaleString('ko-KR',{maximumFractionDigits:2})}${unit}`;
const series=[{key:'deposit',label:'고객예탁금',color:'#48c7d7',value:p=>p.deposit/10000,unit:'조원'},{key:'credit',label:'신용융자 잔고',color:'#ffbf59',value:p=>p.credit/10000,unit:'조원'},{key:'ratio',label:'신용융자 / 예탁금',color:'#b59bfa',value:creditRatio,unit:'%'}];
export async function initCredit(){
 let data,points=[],months=12,busy=false;
 function choose(index){
  if(!points.length)return;index=Math.max(0,Math.min(points.length-1,index));const p=points[index];$('credit-slider').value=String(index);$('credit-slider').setAttribute('aria-valuetext',`${p.date}, 예탁금 ${money(p.deposit)}, 신용융자 ${money(p.credit)}, 비율 ${pct(creditRatio(p))}`);
  $('credit-selected-date').textContent=dateText(p.date);$('credit-selected-deposit').textContent=money(p.deposit);$('credit-selected-credit').textContent=money(p.credit);$('credit-selected-ratio').textContent=pct(creditRatio(p));
  for(const s of series){const svg=$('credit-chart-'+s.key).querySelector('svg');if(!svg)continue;const x=Number(svg.dataset.start)===Number(svg.dataset.end)?68+Number(svg.dataset.span)/2:68+(Date.parse(p.date)-Number(svg.dataset.start))/(Number(svg.dataset.end)-Number(svg.dataset.start))*Number(svg.dataset.span);const y=214-(s.value(p)-Number(svg.dataset.min))/(Number(svg.dataset.max)-Number(svg.dataset.min))*176;svg.querySelector('line[data-cursor]').setAttribute('x1',x);svg.querySelector('line[data-cursor]').setAttribute('x2',x);const dot=svg.querySelector('circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);}
 }
 function draw(s){
  const node=$('credit-chart-'+s.key),values=points.map(s.value),low=Math.min(...values),high=Math.max(...values),pad=Math.max((high-low)*.14,high*.002,.01),min=Math.max(0,low-pad),max=high+pad,start=Date.parse(points[0].date),end=Date.parse(points.at(-1).date);
  const width=Math.max(320,node.clientWidth),span=width-86,right=width-18,x=p=>end===start?68+span/2:68+(Date.parse(p.date)-start)/(end-start)*span,y=v=>214-(v-min)/(max-min)*176;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} 260`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`${s.label}, ${dateText(points[0].date)}부터 ${dateText(points.at(-1).date)}, 단위 ${s.unit}`);Object.assign(svg.dataset,{min,max,start,end,span,width});
  function add(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;svg.append(n);return n;}
  for(let i=0;i<5;i++){const value=min+(max-min)*i/4,py=y(value);add('line',{x1:68,x2:right,y1:py,y2:py,stroke:'#263340','stroke-width':1});add('text',{x:56,y:py+4,'text-anchor':'end',fill:'#98a9b9','font-size':13},value.toFixed(2));}
  const intervals=width<600?2:3;for(let i=0;i<=intervals;i++){const time=start+(end-start)*i/intervals;add('text',{x:68+span*i/intervals,y:244,fill:'#98a9b9','font-size':13,'text-anchor':i===0?'start':i===intervals?'end':'middle'},dateText(new Date(time).toISOString().slice(0,10)));}
  add('path',{d:points.map((p,i)=>(i?'L':'M')+x(p).toFixed(2)+','+y(s.value(p)).toFixed(2)).join(' '),fill:'none',stroke:s.color,'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'});
  add('line',{'data-cursor':'',x1:right,x2:right,y1:32,y2:218,stroke:'#6e8194','stroke-dasharray':'4 5'});add('circle',{cx:right,cy:y(values.at(-1)),r:4.5,fill:s.color,stroke:'#101923','stroke-width':2});
  svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect(),relative=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*width-68)/span)),time=start+relative*(end-start);let index=0;for(let i=1;i<points.length;i++)if(Math.abs(Date.parse(points[i].date)-time)<Math.abs(Date.parse(points[index].date)-time))index=i;choose(index);});
  node.replaceChildren(svg);$('credit-range-'+s.key).textContent=`기간 최저 ${low.toFixed(2)}${s.unit} · 최고 ${high.toFixed(2)}${s.unit} · 기간 변화 ${signed(values.at(-1)-values[0],s.key==='ratio'?'%p':s.unit)}`;
 }
 function render(){
  points=creditWindow(data.points,months);$('credit-period').textContent=`${dateText(points[0].date)} — ${dateText(points.at(-1).date)} · ${points.length}개 제공일`;
  for(const s of series)draw(s);$('credit-slider').max=String(points.length-1);$('credit-slider').disabled=false;choose(points.length-1);
 }
 async function load(){
  if(busy)return;busy=true;$('credit-refresh').disabled=true;
  try{const r=await fetch('./data/credit.json',{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(!validateCreditData(next))throw Error();data=next;
   const current=data.points.at(-1),previous=data.points.at(-2);$('credit-asof').textContent=`자료 기준 ${dateText(data.asOf)}`;
   for(const s of series){const value=s.key==='ratio'?pct(creditRatio(current)):money(current[s.key]),delta=s.key==='ratio'?creditRatio(current)-creditRatio(previous):current[s.key]-previous[s.key];$('credit-latest-'+s.key).textContent=value;const n=$('credit-delta-'+s.key);n.textContent='직전 제공일 대비 '+signed(delta,s.key==='ratio'?'%p':'억원');n.className=delta>0?'up':delta<0?'down':'';}
   $('credit-collected').textContent='수집 '+new Date(data.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' (한국 시간)';
   const warn=$('credit-warning');warn.hidden=data.status==='ok';warn.textContent='최근 수집에 실패하여 마지막 정상 자료를 표시합니다. 자료 기준일과 수집 시각을 확인해 주세요.';render();
  }catch{const warn=$('credit-warning');warn.hidden=false;warn.textContent=data?'새 자료를 확인하지 못했습니다. 현재 표시 중인 자료를 유지합니다.':'신용잔고 자료를 불러오지 못했습니다. 잠시 후 자료 다시 불러오기를 눌러 주세요.';}
  finally{busy=false;$('credit-refresh').disabled=false;}
 }
 document.querySelectorAll('[data-credit-months]').forEach(button=>button.onclick=()=>{months=Number(button.dataset.creditMonths);document.querySelectorAll('[data-credit-months]').forEach(n=>n.setAttribute('aria-pressed',String(n===button)));if(data)render();});
 let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data)render();},120);});
 $('credit-slider').oninput=event=>choose(Number(event.target.value));$('credit-refresh').onclick=load;await load();setInterval(()=>{if(!document.hidden)load();},300000);
}
