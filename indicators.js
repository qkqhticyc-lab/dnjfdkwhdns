import{mergeThreeDay,retainHistory}from'./indicator-history.mjs';
import {INDICATORS} from './quotes-core.mjs';
import {retainLiveItems} from './live-indicators-core.mjs';
const num=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—',sign=(n,d=2)=>Number.isFinite(n)?(n>0?'+':'')+num(n,d):'—';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const kst=at=>new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
const localLabel=at=>at?.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2}).*/,'$1-$2-$3 $4:$5');
// Equal date widths prevent today's denser quotes from squeezing older sessions.
function datePositions(points=[]){const days=[...new Set(points.map(p=>p.at.slice(0,8)))],minute=p=>+p.at.slice(8,10)*60+(+p.at.slice(10,12));const bounds=days.map(d=>{const a=points.filter(p=>p.at.startsWith(d));return[minute(a[0]),minute(a.at(-1))];});return points.map(p=>{const d=days.indexOf(p.at.slice(0,8)),[lo,hi]=bounds[d];return{x:d*1.08+(minute(p)-lo)/(hi-lo||1),value:p.price,at:p.at};});}
export async function initIndicators(config){
 const grid=document.getElementById('indicator-grid'),warning=document.getElementById('indicator-warning'),button=document.getElementById('indicator-refresh');let history,intraday,live,busy=false,mode='day';const selections=new Map();
 const headers={apikey:config.supabase.publishableKey,Authorization:'Bearer '+config.supabase.edgeAnonKey};
 function draw(){const focus=document.activeElement?.dataset?.indicatorCursor;grid.replaceChildren();
  for(const def of INDICATORS){
   const daily=history?.items?.find(p=>p.id===def.id),quote=live?.items?.find(p=>p.id===def.id),current=['ok','stale'].includes(quote?.status)?quote:null,old=['ok','stale'].includes(daily?.status)?daily:null,item=current||old;
   const card=el('article',null,'panel indicator-card');card.dataset.indicator=def.id;const heading=el('div',null,'indicator-heading');heading.append(el('h3',def.name),el('small',current?.code||def.symbol));card.append(heading);
   if(!item||!Number.isFinite(item.price)){card.append(el('p','자료 확인 중','indicator-price'),el('p','제공처 시세를 확인하지 못했습니다.','indicator-note'));grid.append(card);continue;}
   const late=current?.marketStatus==='OPEN'&&Date.now()-Date.parse(current.quoteAt)>((current.delayMinutes||0)+15)*60000;
   const status=!current?'저장된 일봉 · 장중 연결 대기':`${current.marketStatus==='CLOSE'?'장마감':current.marketStatus==='OPEN'?'장중':'장 상태 '+current.marketStatus} · ${current.delayLabel}${current.status==='stale'?' · 이전 조회 자료':late?' · 시세 시각 지연':''}`;
   card.append(el('p',status,'indicator-live-status'));
   card.append(el('p',(def.kind==='future'?'$':'')+num(item.price,def.digits)+(def.kind==='yield'?'%':''),'indicator-price'));
   card.append(el('p',item.change==null?'전일 대비 미제공':(def.kind==='yield'?sign(item.bp,1)+'bp':sign(item.change,def.digits))+' ('+sign(item.changePercent)+'%)',item.change>=0?'up':'down'));
   card.append(el('p',current?`시세 ${kst(current.quoteAt)} KST`:`일봉 기준 ${old.asOf}`,'indicator-note'),el('p',`${def.unit}${current?.contract?' · '+current.contract+' 근월물':''}`,'indicator-note'));
   const series=intraday?.items?.find(p=>p.id===def.id),merged=mergeThreeDay(series,current);
   const points=mode==='day'?datePositions(merged):old?.points?.filter(p=>Number.isFinite(p.close)&&p.close>0).map((p,i)=>({x:i,value:p.close,at:p.date}));
   if(points?.length){
    const low=Math.min(...points.map(p=>p.value)),high=Math.max(...points.map(p=>p.value)),span=high-low||1,minX=points[0].x,maxX=points.at(-1).x;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 300 80');svg.setAttribute('role','img');svg.setAttribute('aria-label',def.name+(mode==='day'?' 최근 3일 분봉 추이':' 최근 3개월 일봉 추이'));
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',points.map((p,i)=>(i?'L':'M')+(2+(p.x-minX)/(maxX-minX||1)*296).toFixed(2)+','+(65-(p.value-low)/span*57).toFixed(2)).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',points.at(-1).value>=points[0].value?'#ce4149':'#3376ce');path.setAttribute('stroke-width','2');svg.append(path);
    if(mode==='day'){const groups=[];points.forEach((p,i)=>{if(!i||p.at.slice(0,8)!==points[i-1].at.slice(0,8))groups.push(i);});for(const i of groups){const xx=2+(points[i].x-minX)/(maxX-minX||1)*296;if(i){const line=document.createElementNS(svg.namespaceURI,'line');for(const[k,v]of Object.entries({x1:xx,x2:xx,y1:3,y2:67,stroke:'#9caaa5','stroke-dasharray':'3 3','data-day-boundary':''}))line.setAttribute(k,v);svg.append(line);}const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',Math.min(265,xx+2));label.setAttribute('y','79');label.setAttribute('font-size','9');label.setAttribute('fill','#687c74');label.textContent=points[i].at.slice(4,6)+'/'+points[i].at.slice(6,8);svg.append(label);}card.append(el('p','차트 시작 대비 '+sign((points.at(-1).value/points[0].value-1)*100)+'% · '+groups.length+'개 날짜','indicator-note'));}

    if(points.length===1){const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx','2');dot.setAttribute('cy','65');dot.setAttribute('r','3');dot.setAttribute('fill','#3376ce');svg.append(dot);}card.append(svg);
    if(mode==='day'){
     card.append(el('p',(series?.provider==='yahoo'?'Yahoo 5분봉 · 30분 수집 보완 · 현재 시세와 별도 출처':'네이버 분봉')+(series?.status==='stale'?' · 과거 구간 갱신 지연':''),'indicator-note'));
     card.append(el('p',`분봉 ${localLabel(points[0].at)} ~ ${localLabel(points.at(-1).at)} · 현지시간`,'indicator-note'));
     const label=el('label',null,'indicator-cursor'),out=el('span'),slider=el('input');slider.type='range';slider.min='0';slider.max=String(points.length-1);slider.dataset.indicatorCursor=def.id;slider.setAttribute('aria-label',def.name+' 분봉 시간 선택');const selected=selections.get(def.id),index=selected?points.findIndex(p=>p.at===selected):-1;slider.value=String(index>=0?index:points.length-1);const select=(user=false)=>{const p=points[Number(slider.value)];if(user)selections.set(def.id,p.at);out.textContent=`${localLabel(p.at)} · ${num(p.value,def.digits)}${def.kind==='yield'?'%':''} (현지)`;};select();slider.oninput=()=>select(true);svg.onclick=e=>{const r=svg.getBoundingClientRect(),x=minX+Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*300-2)/296))*(maxX-minX);slider.value=String(points.reduce((best,p,i)=>Math.abs(p.x-x)<Math.abs(points[best].x-x)?i:best,0));select(true);};label.append(out,slider);card.append(label);
    }else{
     const range=el('div',null,'indicator-range'),bar=el('div'),dot=el('i');dot.style.left=Math.max(0,Math.min(100,(old.price-low)/span*100))+'%';bar.append(dot);range.append(el('span',num(low,def.digits)),bar,el('span',num(high,def.digits)));card.append(range,el('p','3개월 일봉 범위 · 일봉 최근값 위치','indicator-range-label'));
    }
   }else card.append(el('p',mode==='day'?'장중 차트 연결 지연 · 시세와 차트는 각각 갱신합니다.':'과거 일봉을 확인하지 못했습니다.','indicator-chart-empty'));
   if(old){card.append(el('p',`과거 성과 · Yahoo 일봉 ${old.asOf} 기준${old.status==='stale'?' · 이전 자료':''}`,'indicator-history-label'));const periods=el('div',null,'indicator-periods');for(const p of old.periods||[]){const box=el('div'),value=p.percent==null?'자료 부족':def.kind==='yield'?sign(p.bp,1)+'bp':sign(p.percent)+'%';box.append(el('span',p.label),el('strong',value,p.percent>=0?'up':'down'));periods.append(box);}card.append(periods);if(def.id==='us10y')card.append(el('p','과거 성과는 CBOE 10년 금리(^TNX) 참고값입니다.','indicator-note'));}
   const link=el('a',current?'장중 원자료 ↗':'일봉 원자료 ↗','indicator-source');link.href=current?.source||old?.source||'https://finance.yahoo.com/quote/'+encodeURIComponent(def.symbol)+'/';link.target='_blank';link.rel='noopener noreferrer';card.append(link);grid.append(card);
  }
  if(focus)grid.querySelector(`[data-indicator-cursor="${focus}"]`)?.focus({preventScroll:true});
  const count=live?.items?.filter(i=>i.status==='ok').length||0,stale=live?.items?.some(i=>i.status==='stale');warning.hidden=count===12&&!stale;warning.textContent=live?`일부 장중 시세의 연결이 지연됩니다. 이전 자료는 원래 시세 시각을 유지합니다. (${count}/12 정상 조회)`:'장중 시세 연결 중 · 저장된 일봉은 장중 차트와 구분해 표시합니다.';
  document.getElementById('indicator-updated').textContent=live?`장중 조회 ${kst(live.collectedAt)} KST · 접속 중 15초마다 확인 · 제공처 지연은 카드별 표시`:'장중 시세를 확인하고 있습니다.';
 }
 async function loadLive(){if(busy)return;busy=true;button.disabled=true;try{const r=await fetch(config.supabase.url+'/functions/v1/market-indicators',{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const d=await r.json();if(d.schemaVersion!==1||d.items?.length!==12)throw Error();live=retainLiveItems(d,live);}catch{if(live)live={...live,items:live.items.map(i=>i.status==='ok'?{...i,status:'stale'}:i)};}finally{busy=false;button.disabled=false;draw();}}
 async function loadIntraday(){try{const r=await fetch(config.supabase.url+'/functions/v1/market-indicators?history=1',{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const d=await r.json();if(d.items?.length!==12)throw Error();intraday=retainHistory(d,intraday);}catch{}await loadStoredIntraday();draw();}
 async function loadStoredIntraday(){try{const d=await fetch('./data/indicator-history.json',{cache:'no-store'}).then(r=>r.json());if(d.items?.length===12){const previous=intraday;intraday={...d,items:d.items.map(n=>{const p=previous?.items?.find(p=>p.id===n.id&&p.points?.length);return p&&(!n.points?.length||n.points.at(-1).at<p.points.at(-1).at)?p:n;})};}}catch{}draw();}
 async function loadHistory(){try{const r=await fetch('./data/indicators.json',{cache:'no-store',signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error();const d=await r.json();if(d.schemaVersion!==1||d.items?.length!==12)throw Error();history=d;draw();}catch{}}
 document.querySelectorAll('[data-indicator-range]').forEach(b=>b.onclick=()=>{mode=b.dataset.indicatorRange;document.querySelectorAll('[data-indicator-range]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));draw();});
 button.onclick=()=>{loadLive();loadHistory();loadIntraday();};draw();await Promise.all([loadLive(),loadHistory(),loadStoredIntraday().then(loadIntraday)]);setInterval(()=>{if(!document.hidden)loadLive();},15000);setInterval(()=>{if(!document.hidden){loadHistory();loadIntraday();}},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadLive();});
}
