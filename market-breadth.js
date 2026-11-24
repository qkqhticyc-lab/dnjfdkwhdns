import {validateBreadth,normalizedPrices} from './market-breadth-core.mjs';
const f=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const periods=[{id:'ma20',label:'S&P 500 · 20일선 위 종목 비율',color:'#e5edf5'},{id:'ma50',label:'S&P 500 · 50일선 위 종목 비율',color:'#e5edf5'},{id:'ma200',label:'S&P 500 · 200일선 위 종목 비율',color:'#e5edf5'}];
function path(values,x,y){let open=false;return values.map((v,i)=>{if(!Number.isFinite(v)){open=false;return '';}const s=(open?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2);open=true;return s;}).join(' ');}
export function initMarketBreadth(){
 const root=document.querySelector('#market-breadth');if(!root)return;
 const chart=root.querySelector('[data-breadth-chart]'),notice=root.querySelector('[data-breadth-status]'),summary=root.querySelector('[data-breadth-summary]');
 let data,range=252,end=null,view=[],selected=null,drag=null,busy=false,model=[];
 const metric=p=>{if(!p)return '—';return periods.map(d=>`${d.id.slice(2)}일선 위 ${f(p[d.id]?.value)}%`).join(' · ');};
 function draw(){
  if(!data)return;const count=range===0?data.prices.length:range,endIndex=Math.min(end??data.prices.length,data.prices.length),start=Math.max(0,endIndex-count);view=data.prices.slice(start,endIndex);if(!view.length)return;
  const prices=normalizedPrices(view),breadthMap=new Map(data.breadth.map(p=>[p.date,p])),zbtMap=new Map(data.zbt.map(p=>[p.date,p]));
  const width=Math.max(280,chart.clientWidth||900),mobile=width<600,left=14,right=58,plotWidth=width-left-right,x=i=>left+i/Math.max(1,view.length-1)*plotWidth;
  const pricesAll=prices.flatMap(p=>[p.SPY,p.RSP]),lo=Math.min(...pricesAll),hi=Math.max(...pricesAll),padding=Math.max((hi-lo)*.09,2);
  model=[{id:'price',label:'SPY · RSP 가격 흐름',height:mobile?180:230,min:lo-padding,max:hi+padding,lines:[{values:prices.map(p=>p.SPY),color:'#4f8bff'},{values:prices.map(p=>p.RSP),color:'#f4d449'}],ticks:[],unit:'',read:p=>`SPY ${f(p.SPY,2)} USD · RSP ${f(p.RSP,2)} USD`},...periods.map(d=>({...d,height:mobile?105:115,min:0,max:100,lines:[{values:view.map(p=>breadthMap.get(p.date)?.[d.id]?.value??null),color:d.color}],ticks:[20,50,80],unit:'%',read:p=>{const row=breadthMap.get(p.date)?.[d.id];return row?.value==null?'이 날짜의 충분한 관측 자료 없음':`${f(row.value)}% · ${row.above}/${row.eligible}종목`;}})),{id:'zbt',label:'NYSE 상승 참여 · ZBT(10)',height:mobile?140:155,min:0,max:1,lines:[{values:view.map(p=>zbtMap.get(p.date)?.value??null),color:'#4f8bff'}],ticks:[.4,.615],unit:'',read:p=>{const z=zbtMap.get(p.date);return z?.value==null?'이 날짜의 검증 자료 없음':`${f(z.value,4)}${z.approximate?' · 초기값 영향 있음':''}${z.signal?' · 확산 신호 충족':''}`;}}];
  if(!model[0].ticks.length)model[0].ticks=[0,1,2,3].map(i=>lo-padding+(hi-lo+padding*2)*i/3);
  chart.innerHTML=model.map((p,index)=>{
   const top=8,bottom=p.id==='zbt'?28:10,h=p.height,y=v=>top+(p.max-v)/(p.max-p.min)*(h-top-bottom);p.y=y;p.width=width;p.height=h;
   const grid=p.ticks.map(v=>`<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="#33424f" stroke-dasharray="${p.id==='zbt'?'4 4':'2 4'}"/><text x="${width-right+7}" y="${y(v)+4}" fill="#aebdcb" font-size="11">${p.id==='zbt'?v.toFixed(3):f(v,0)+p.unit}</text>`).join('');
   const labels=p.id==='zbt'?[0,.25,.5,.75,1].map(t=>{const i=Math.round((view.length-1)*t);return `<text x="${x(i)}" y="${h-6}" text-anchor="${t===0?'start':t===1?'end':'middle'}" fill="#aebdcb" font-size="10">${view[i].date.slice(mobile?5:2)}</text>`;}).join(''):'';
   const lines=p.lines.map(l=>`<path d="${path(l.values,x,y)}" stroke="${l.color}" stroke-width="1.7" fill="none"/>`).join('');
   const signals=p.id==='zbt'?view.map((r,i)=>zbtMap.get(r.date)?.signal?`<circle cx="${x(i)}" cy="${y(zbtMap.get(r.date).value)}" r="4" fill="#f66b74"/>`:'').join(''):'';
   const firstKnown=p.lines[0].values.findIndex(v=>v!=null);
   const empty=p.lines.every(l=>l.values.every(v=>v==null))?`<text x="${left+12}" y="${h/2}" fill="#aebdcb" font-size="12">이 기간의 검증 자료가 없습니다.</text>`:p.id==='zbt'&&firstKnown>0?`<text x="${left+12}" y="22" fill="#aebdcb" font-size="11">NYSE 자료: ${view[firstKnown].date}부터</text>`:'';
   return `<div class="breadth-pane"><div class="breadth-pane-heading"><h3>${p.label}</h3><span data-pane-value="${p.id}">${esc(p.read(view.at(-1)))}</span></div><svg data-pane="${index}" viewBox="0 0 ${width} ${h}" role="img" aria-label="${p.label}" style="height:${h}px"><defs><clipPath id="breadth-clip-${p.id}"><rect x="${left}" y="0" width="${plotWidth}" height="${h-bottom+2}"/></clipPath></defs>${grid}<g clip-path="url(#breadth-clip-${p.id})">${lines}${signals}</g>${empty}${labels}<g data-cursor></g></svg></div>`;
  }).join('');
  root.querySelector('[data-breadth-window]').textContent=`${view[0].date} ~ ${view.at(-1).date} · 첫날 가격=100 · 일봉`;
  root.querySelector('[data-breadth-date]').textContent=view.at(-1).date;
  root.querySelector('[data-breadth-latest]').disabled=endIndex===data.prices.length;
  const latest=data.breadth.at(-1);summary.textContent=`${data.asOf} 기준 · ${metric(latest)}`;
  if(selected!=null)cursor(Math.max(0,Math.min(selected,view.length-1)));
 }
 function cursor(i,active=null,pointerY=null){
  if(!view.length)return;selected=i;const row=view[i];root.querySelector('[data-breadth-date]').textContent=row.date;
  for(const [index,p] of model.entries()){
   const svg=chart.querySelector(`[data-pane="${index}"]`),x=14+i/Math.max(1,view.length-1)*(p.width-72);root.querySelector(`[data-pane-value="${p.id}"]`).textContent=p.read(row);
   let html=`<line x1="${x}" x2="${x}" y1="0" y2="${p.height}" stroke="#9baabb" stroke-dasharray="3 3"/>`;
   if(index===active&&pointerY!=null){const yy=Math.max(8,Math.min(p.height-(p.id==='zbt'?28:10),pointerY)),v=p.max-(yy-8)/(p.height-8-(p.id==='zbt'?28:10))*(p.max-p.min);html+=`<line x1="14" x2="${p.width-58}" y1="${yy}" y2="${yy}" stroke="#9baabb" stroke-dasharray="3 3"/><rect x="${p.width-57}" y="${yy-10}" width="56" height="20" rx="3" fill="#34495e"/><text x="${p.width-29}" y="${yy+4}" text-anchor="middle" fill="white" font-size="10">${f(v,p.id==='zbt'?3:1)}${p.unit}</text>`;}
   svg.querySelector('[data-cursor]').innerHTML=html;
  }
 }
 function locate(event){const svg=event.target.closest('svg[data-pane]');if(!svg||!view.length)return null;const box=svg.getBoundingClientRect(),index=Number(svg.dataset.pane),p=model[index],ratio=(event.clientX-box.left-14)/(p.width-72);return {i:Math.max(0,Math.min(view.length-1,Math.round(ratio*(view.length-1)))),active:index,y:(event.clientY-box.top)*p.height/box.height};}
 chart.addEventListener('pointermove',e=>{
  if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.horizontal&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy))drag.horizontal=true;if(drag.horizontal){e.preventDefault();const shift=Math.round(-dx/Math.max(1,chart.clientWidth-72)*drag.count);end=Math.max(Math.min(drag.count,data.prices.length),Math.min(data.prices.length,drag.end+shift));selected=null;draw();return;}}
  const hit=locate(e);if(hit)cursor(hit.i,hit.active,hit.y);
 });
 chart.addEventListener('pointerdown',e=>{if(!data)return;drag={x:e.clientX,y:e.clientY,end:end??data.prices.length,count:view.length,horizontal:false};const hit=locate(e);if(hit)cursor(hit.i,hit.active,hit.y);});
 const stop=()=>{drag=null;};window.addEventListener('pointerup',stop);chart.addEventListener('pointercancel',stop);
 chart.addEventListener('keydown',e=>{if(!view.length)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();cursor(Math.max(0,Math.min(view.length-1,(selected??view.length-1)+(e.key==='ArrowRight'?1:-1))));}if(e.key==='Escape'){selected=null;draw();}});
 root.querySelector('[data-breadth-range]').addEventListener('change',e=>{range=Number(e.target.value);end=null;selected=null;draw();});
 root.querySelector('[data-breadth-latest]').addEventListener('click',()=>{end=null;selected=null;draw();});
 for(const sign of ['in','out'])root.querySelector(`[data-breadth-zoom="${sign}"]`).addEventListener('click',()=>{range=Math.max(20,Math.min(data?.prices.length||1260,Math.round((range||view.length)*(sign==='in'?.7:1.4))));selected=null;root.querySelector('[data-breadth-range]').value='custom';draw();});
 let resize;new ResizeObserver(()=>{clearTimeout(resize);resize=setTimeout(draw,60);}).observe(chart);
 async function load(){
  if(busy)return;busy=true;root.querySelector('[data-breadth-refresh]').disabled=true;
  try{const r=await fetch('./data/market-breadth.json',{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(!validateBreadth(next))throw Error();data=next;draw();const last=data.nyseRaw.at(-1);notice.textContent=`S&P 500 구성 ${data.coverage.total}종목 중 ${data.coverage.loaded}종목 가격 확보 · 자체 산출 · NYSE 자료 ${last?.date||'미확보'}${data.refreshError?' · 갱신 지연으로 이전 자료 표시':''}`;root.querySelector('[data-breadth-nyse-note]').textContent=`NYSE ZBT는 ${data.zbt.find(p=>p.value!=null)?.date||'자료 확보 후'}부터 표시합니다. 앞선 기간은 비워 둡니다. 초기 30개 관측까지는 EMA 초기값의 영향이 있습니다.`;
  }catch{notice.textContent=data?'새 자료를 받지 못해 기존 차트를 유지합니다.':'자료를 불러오지 못했습니다. 잠시 후 다시 불러오기를 눌러주세요.';}finally{busy=false;root.querySelector('[data-breadth-refresh]').disabled=false;}
 }
 root.querySelector('[data-breadth-refresh]').addEventListener('click',load);
 setInterval(()=>{if(!document.hidden)load();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 return load();
}
