import{viewWindow,setWindow,zoomWindow,scalePrice}from'./chart-viewport.mjs';
import{GUIDE_LINES}from'./chart-guide-core.mjs';
import{STRATEGY_RULES}from'./strategy-core.mjs';
import{buildTradePlan,PLAN_RULES}from'./trade-plan.mjs';
const GUIDE_RULES=STRATEGY_RULES.map(r=>['tp1','tp2'].includes(r.key)?{...r,label:r.key==='tp1'?'과거 신호 TP1 · 2R':'과거 신호 TP2 · 3R'}:r);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;},ns='http://www.w3.org/2000/svg',svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;},num=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:d}):'—';
const viewStates=new Map();
const prefs={frame:'daily',count:120,averages:true,signals:true,levels:true,maxRiskPct:8};
const when=(at,frame)=>frame.timeframe==='1d'?at:new Date(at).toLocaleString('ko-KR',{timeZone:frame.timezone||'UTC',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const trendLabel={up:'상승 정렬',down:'하락 정렬',mixed:'혼조',insufficient:'이동평균 준비 중'};
export function guideView(data,options={}){
 if(options.frame)prefs.frame=options.frame;
 if(options.count)prefs.count=options.count;
 const section=el('section',null,'panel chart-guide');section.setAttribute('aria-label','공개 규칙 보조지표');
 const head=el('div',null,'guide-heading');head.append(el('div','LIVE CHART · 자체 규칙 v2','eyebrow'));
 section.append(head,el('p','가격·거래량·이동평균·매매 신호를 함께 봅니다. 진행 봉의 잠정 신호는 가격 변화에 따라 사라질 수 있습니다.','guide-note'));
 const controls=el('div',null,'guide-controls'),tabs=el('div',null,'guide-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','보조지표 봉 주기');
 for(const[key,label]of[['daily','일봉'],['fourHour','4시간봉']]){const b=el('button',label);b.type='button';b.dataset.guideFrame=key;b.onclick=()=>{if(options.onFrame)options.onFrame(key);else{prefs.frame=key;draw();}};tabs.append(b);}
 const range=el('label','표시 봉 수 '),select=el('select');select.setAttribute('aria-label','보조지표 표시 봉 수');for(const count of[22,60,66,120,132,240,252,500]){const o=el('option',count===500?'전체 (최대 500봉)':count+'봉');o.value=count;select.append(o);}select.value=prefs.count;select.onchange=()=>{prefs.count=+select.value;draw();};range.append(select);controls.append(tabs);if(!options.range)controls.append(range);
 for(const[key,label]of[['averages','이동평균'],['signals','신호 표시'],['levels','목표·손절·20봉 고저선']]){const l=el('label'),input=el('input');input.type='checkbox';input.checked=prefs[key];input.dataset.guideToggle=key;input.onchange=()=>{prefs[key]=input.checked;draw();};l.append(input,document.createTextNode(label));controls.append(l);}section.append(controls);
 const content=el('div',null,'guide-content');section.append(content);
 const viewKey=[data.market,data.symbol,prefs.frame].join(':'),stateKey=(options.range||prefs.count)+':'+(options.viewRevision||0);let view=viewStates.get(viewKey);
 if(!view||view.key!==stateKey){view={key:stateKey,count:0,follow:true,startAt:null,price:null};if(viewStates.size>30)viewStates.delete(viewStates.keys().next().value);viewStates.set(viewKey,view);}
 let drag=null,current=null,pointers=new Map(),wheelTimer;
 const redraw=()=>{const focusPlot=document.activeElement?.tagName?.toLowerCase()==='svg';draw();if(focusPlot)content.querySelector('svg')?.focus({preventScroll:true});};
 section.ondblclick=e=>{if(!current)return;const r=content.querySelector('svg')?.getBoundingClientRect();if(r&&(e.clientX-r.left)/r.width*current.width>=current.width-82&&e.clientY>=r.top&&e.clientY<=r.bottom){view.price=null;redraw();}};
 const interactionDone=()=>{delete section.dataset.interacting;options.onInteractionEnd?.();};
 section.onpointermove=e=>{
  if(!pointers.has(e.pointerId)||!drag||!current)return;
  e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const {rows,width,rect,step}=drag;
  if(pointers.size===2&&drag.kind==='pinch'){const a=[...pointers.values()],dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),count=drag.count*drag.distance/Math.max(10,dist);setWindow(rows,view,drag.start+drag.anchor*(drag.count-count),count);}
  else if(drag.kind==='price')view.price=scalePrice(drag.price,Math.exp((e.clientY-drag.y)/rect.height*3));
  else if(drag.kind==='pan')setWindow(rows,view,drag.start-(e.clientX-drag.x)/rect.width*width/step,drag.count);
  redraw();
 };
 const endPointer=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);try{section.releasePointerCapture(e.pointerId);}catch{}if(pointers.size){const [id,p]=[...pointers][0];drag={...current,kind:'pan',x:p.x,y:p.y,start:current.window.start,count:current.window.count};}else{drag=null;interactionDone();}};
 section.onpointerup=endPointer;section.onpointercancel=endPointer;section.onlostpointercapture=e=>{if(pointers.has(e.pointerId))endPointer(e);};

 function draw(){
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guideFrame===prefs.frame)));content.replaceChildren();
  const frame=data.frameInfo||data.reversals?.[prefs.frame],guide=data.guide||frame?.guide;
  if(!guide?.frames?.length){content.append(el('p',frame?.reason||'이 주기의 보조지표 자료가 없습니다. 분석 다시 불러오기로 확인해 주세요.','guide-notice'));return;}
  let frames=guide.frames.slice(-Math.min(prefs.count,500));if(options.range){const end=new Date(guide.frames.at(-1).asOf),months=({'1mo':1,'3mo':3,'6mo':6,'1y':12,'2y':24})[options.range];end.setUTCMonth(end.getUTCMonth()-months);frames=guide.frames.filter(p=>Date.parse(p.asOf)>=end.getTime()).slice(-500);}
  if(!view.count)view.count=frames.length;
  const window=viewWindow(guide.frames,view);frames=guide.frames.slice(window.start,window.end);
  const last=guide.frames.at(-1),title=el('div',null,'guide-latest');title.append(el('strong',trendLabel[last.trend],'guide-trend guide-'+last.trend),el('span',(last.provisional?'진행 봉 · 잠정 ':'최근 마감봉 ')+num(last.close,4)+' '+data.currency),el('span',(last.start?when(last.start,frame)+' → ':'')+when(last.asOf,frame)+(frame.timeframe==='4h'?' (현지)':'')));content.append(title);
  const active=last.active.map(k=>GUIDE_RULES.find(r=>r.key===k).label);content.append(el('p','현재 충족 조건: '+(active.join(' · ')||'없음')+' · RSI '+num(last.rsi,1)+' · ATR '+num(last.atr,4)+' · 거래량 '+(last.volumeRatio==null?'비교 자료 부족':num(last.volumeRatio)+'배'),'guide-note'));
  if(frame.status==='stale'||data.status==='stale')content.append(el('p','새 자료 연결 지연 · 이전 분석과 원래 기준 시각을 유지합니다.','guide-notice'));
  content.append(el('p',frame.sessionNote||'진행 봉 포함 · 30초마다 조회','guide-note'));
  if(frame.sourceThrough)content.append(el('p',(frame.timeframe==='4h'?'분봉 기준 ':'가격·일봉 조회 기준 ')+new Date(frame.sourceThrough).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST · 제공처 지연 가능','guide-note'));
  const trade=frames.at(-1).trade,plan=buildTradePlan(guide.frames.slice(0,window.end),{maxRiskPct:prefs.maxRiskPct}),price=v=>num(v,['KRW','JPY'].includes(data.currency)?0:2),distance=v=>Number.isFinite(v)?((v/plan.entry-1)*100>=0?'+':'')+num((v/plan.entry-1)*100,2)+'%':'—';
  const planning=el('div',null,'guide-plan');planning.dataset.planStatus=plan.status;planning.dataset.planAsOf=plan.asOf;const planHead=el('div',null,'guide-plan-heading');planHead.append(el('h3',view.follow?'현재 가격 기준 매매 검토':'표시 마지막 봉 기준 매매 검토'));
  const limitLabel=el('label','손절폭 한도 '),limit=el('select');limit.setAttribute('aria-label','매매 검토 손절폭 한도');for(const n of[5,8,12]){const o=el('option',n+'%');o.value=n;limit.append(o);}limit.value=prefs.maxRiskPct;limit.onchange=()=>{prefs.maxRiskPct=+limit.value;redraw();};limitLabel.append(limit);planHead.append(limitLabel);planning.append(planHead);
  planning.append(el('strong',plan.label+(plan.provisional?' · 진행 봉 잠정':''),'guide-plan-status'),el('p',plan.reasons.join(' '),'guide-note'));
  const dashboard=el('div',null,'guide-dashboard');
  for(const[key,label,value,note]of[
   ['entry','검토 기준가',price(plan.entry),'실제 체결가 아님'],
   ['support','가까운 지지 기준',price(plan.support?.value),plan.support?plan.support.kind+' · '+when(plan.support.asOf,frame):'확인 불가'],
   ['stop','손절 후보',price(plan.stop),distance(plan.stop)+' · 기준선 이탈 확인'],
   ['tp1','1차 목표 후보',price(plan.tp1),plan.first?distance(plan.tp1)+' · '+plan.first.kind:'확인 불가'],
   ['tp2','2차 목표 후보',price(plan.tp2),plan.second?distance(plan.tp2)+' · '+plan.second.kind:'다음 저항 미확인'],
   ['rr','1차 후보 손익비',Number.isFinite(plan.rr)?'1 : '+num(plan.rr,2):'—','수익 여지 ÷ 손절폭']
  ]){const cell=el('div');cell.dataset.planValue=key;cell.append(el('small',label),el('strong',value),el('small',note));dashboard.append(cell);}planning.append(dashboard);
  if(plan.status==='wait'&&plan.pullback?.low)planning.append(el('p','눌림 관찰 구간 '+price(plan.pullback.low)+' ~ '+price(plan.pullback.high)+' '+data.currency+' · 자동 매수 구간이 아닙니다. 지지·거래량 회복 확인 후 다시 계산하세요.','guide-plan-pullback'));
  planning.append(el('p','기준 '+when(plan.asOf,frame)+' · 선택 봉 주기의 ATR·지지·저항으로 매번 재계산합니다. 이미 보유한 포지션의 확정 손절선을 대체하지 않습니다. 한도를 바꿔도 가격선을 억지로 좁히지 않습니다.','guide-note'));content.append(planning);
  if(trade){const legacy=el('details',null,'guide-legacy');legacy.append(el('summary','과거 진입 신호의 가상 추적 보기 (기존 2R·3R 규칙)'),el('p',`신호 ${when(trade.started,frame)} · 진입 ${price(trade.entry)} · 추적 손절 ${price(trade.stop)} · TP1 ${price(trade.tp1)} · TP2 ${price(trade.tp2)}. 과거 신호 검토용이며 위의 현재 가격 계획과 다릅니다.`,'guide-note'));content.append(legacy);}
  if(data.reversal?.label)content.append(el('p',data.reversal.label+' · 20·60봉선 기준'+(last.provisional?' · 진행 봉 포함 잠정 판정':''),'guide-note'));
  if(data.metrics)content.append(el('p','추세 강도 ADX(14) '+num(data.metrics.adx,1)+' · +DI '+num(data.metrics.plusDI,1)+' / −DI '+num(data.metrics.minusDI,1)+' · ADX 25 이상은 강한 추세, 방향은 위 추세 판정과 별도로 확인하세요.','guide-note'));
  if(guide.missingLines.length)content.append(el('p',guide.missingLines.join(' · ')+' 자료 부족 — '+guide.observations+'개 봉만 수신했습니다.','guide-notice'));
  const navigation=el('div',null,'guide-navigation');
  const action=(key,text,run)=>{const b=el('button',text);b.type='button';b.dataset.guideAction=key;b.onclick=()=>{run();redraw();};navigation.append(b);return b;};
  action('back','← 과거',()=>setWindow(guide.frames,view,window.start-Math.max(1,Math.round(window.count*.5)),window.count)).disabled=window.start===0;
  action('forward','최근 →',()=>setWindow(guide.frames,view,window.start+Math.max(1,Math.round(window.count*.5)),window.count)).disabled=window.end===guide.frames.length;
  action('zoom-in','시간 확대 +',()=>zoomWindow(guide.frames,view,.75));action('zoom-out','시간 축소 −',()=>zoomWindow(guide.frames,view,1.35));
  action('latest','최신으로',()=>{view.follow=true;});action('auto-price','가격 자동',()=>{view.price=null;});
  const viewLabel=el('span',when(frames[0].asOf,frame)+' ~ '+when(frames.at(-1).asOf,frame)+' · '+frames.length+'봉'+(view.follow?' · 최신 추적':' · 과거 조회'),'guide-window-label');navigation.append(viewLabel);content.append(navigation);
  const width=Math.max(320,Math.round(options.width||1000)),scroll=el('div',null,'guide-plot-scroll'),plot=svg('svg',{viewBox:'0 0 '+width+' 420',role:'img',tabindex:0,'aria-label':(frame.timeframe==='1d'?'일봉':'4시간봉')+' 가격과 이동평균·거래량·보조 신호. 좌우 방향키로 봉 조회.'});scroll.append(plot);content.append(scroll);
  const left=20,right=width-82,top=24,bottom=288,step=(right-left)/frames.length,x=i=>left+(i+.5)*step;
  const values=[...frames.flatMap(p=>[p.high,p.low,p.close,...(prefs.averages?GUIDE_LINES.map(l=>p[l.key]):[]),...(prefs.levels?[p.high20,p.low20]:[])]),...(prefs.levels?[plan.stop,plan.tp1,plan.tp2]:[])].filter(v=>Number.isFinite(v)&&v>0),lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo||hi*.01)*.09,min=view.price?.min??lo-pad,max=view.price?.max??hi+pad,y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  plot.dataset.viewStart=frames[0].asOf;plot.dataset.viewEnd=frames.at(-1).asOf;plot.dataset.viewCount=String(frames.length);plot.dataset.priceMin=String(min);plot.dataset.priceMax=String(max);plot.dataset.follow=String(view.follow);
  for(let i=0;i<5;i++){const yy=top+(bottom-top)*i/4;plot.append(svg('line',{x1:left,x2:right,y1:yy,y2:yy,stroke:'#293b47'}),svg('text',{x:right+9,y:yy+4,fill:'#b2c4cf','font-size':11},num(max-(max-min)*i/4)));}
  const volMax=Math.max(1,...frames.map(p=>p.volume||0));plot.append(svg('text',{x:left,y:318,fill:'#b2c4cf','font-size':11},'거래량 · 1.5배 이상 강조'),svg('text',{x:right+9,y:340,fill:'#b2c4cf','font-size':10},num(volMax,0)));
  const defs=svg('defs'),clip=svg('clipPath',{id:'price-clip-'+viewKey.replace(/[^a-z0-9]/gi,'')});clip.append(svg('rect',{x:left,y:top,width:right-left,height:bottom-top}));defs.append(clip);plot.append(defs);const pricePane=svg('g',{'clip-path':'url(#'+clip.id+')','data-price-pane':''});plot.append(pricePane);
  for(const[p,i]of frames.map((p,i)=>[p,i])){const xx=x(i),color=p.close>=(p.open??p.close)?'#ee6972':'#659cf0';if(options.mode!=='line'&&[p.open,p.high,p.low].every(Number.isFinite)){pricePane.append(svg('line',{x1:xx,x2:xx,y1:y(p.high),y2:y(p.low),stroke:color}),svg('rect',{x:xx-Math.max(1,step*.65)/2,y:Math.min(y(p.open),y(p.close)),width:Math.max(1,step*.65),height:Math.max(1,Math.abs(y(p.open)-y(p.close))),fill:color}));}else pricePane.append(svg('circle',{cx:xx,cy:y(p.close),r:1.5,fill:'#d5e2e5'}));if(p.volume!=null)plot.append(svg('rect',{'data-guide-volume':'',x:xx-step*.32,y:386-p.volume/volMax*54,width:Math.max(1,step*.64),height:p.volume/volMax*54,fill:p.volumeRatio>=1.5?'#e4ba63':color,opacity:p.volumeRatio>=1.5?1:.5}));}
  function line(key,color,dash){let path='',open=false;for(const[p,i]of frames.map((p,i)=>[p,i])){if(!Number.isFinite(p[key])){open=false;continue;}path+=(open?'L':'M')+x(i).toFixed(2)+','+y(p[key]).toFixed(2)+' ';open=true;}if(path)pricePane.append(svg('path',{'data-guide-line':key,d:path,fill:'none',stroke:color,'stroke-width':key==='sma200'?2.5:1.5,...(dash?{'stroke-dasharray':dash}:{})}));}
  if(options.mode==='line')line('close','#70d7bd');
  if(prefs.averages)for(const l of GUIDE_LINES)line(l.key,l.color);
  if(prefs.levels){line('high20','#73c9ac','5 4');line('low20','#96accc','5 4');for(const[key,label,color]of[['stop','손절 후보','#ff929c'],['tp1','1차 후보','#e5c26c'],['tp2','2차 후보','#dfb260']])if(Number.isFinite(plan[key])){const start=Math.max(0,frames.length-12);pricePane.append(svg('line',{'data-guide-target':key,x1:x(start),x2:right,y1:y(plan[key]),y2:y(plan[key]),stroke:color,'stroke-dasharray':'6 4'}),svg('text',{x:right-5,y:y(plan[key])-4,fill:color,'font-size':10,'text-anchor':'end'},label+' '+price(plan[key])));}}
  const ticks=width<600?2:4;for(let i=0;i<=ticks;i++){const k=Math.round((frames.length-1)*i/ticks);plot.append(svg('text',{x:x(k),y:408,fill:'#b2c4cf','font-size':10,'text-anchor':i===0?'start':i===ticks?'end':'middle'},when(frames[k].asOf,frame)));}
  if(prefs.signals){const marked=frames.map((p,i)=>({p,i})).filter(v=>v.p.signals.length).slice(-12).reverse(),occupied=[];
   for(const {p,i} of marked){const rules=p.signals.map(k=>GUIDE_RULES.find(r=>r.key===k)),r=rules[0],event=guide.events.find(e=>e.asOf===p.asOf&&e.key===r.key),xx=x(i),anchor=y(p.high||p.close)-4,text=(p.provisional?'잠정 ':'')+r.label+(event?.count?' ×'+event.count:'')+(rules.length>1?' +'+(rules.length-1):''),width=Math.max(70,text.length*9),tx=Math.min(right-width/2,Math.max(left+width/2,xx)),group=svg('g',{'data-guide-signal':p.asOf});
    group.append(svg('circle',{cx:xx,cy:anchor,r:3,fill:r.color}),svg('title',{},when(p.asOf,frame)+' · '+guide.events.filter(e=>e.asOf===p.asOf).map(e=>(e.provisional?'[잠정] ':'')+GUIDE_RULES.find(r=>r.key===e.key).label+': '+e.reason).join(' / ')));
    for(const offset of[-12,-30,-48,-66,22,40,58,76]){const yy=anchor+offset,box={left:tx-width/2,right:tx+width/2,top:yy-11,bottom:yy+3};if(yy<16||yy>bottom-5||occupied.some(b=>box.left<b.right+5&&box.right>b.left-5&&box.top<b.bottom+3&&box.bottom>b.top-3))continue;occupied.push(box);group.append(svg('line',{x1:xx,x2:tx,y1:anchor,y2:yy,stroke:r.color,opacity:.35}),svg('text',{x:tx,y:yy,fill:r.color,'font-size':10,'text-anchor':'middle','paint-order':'stroke',stroke:'#101a22','stroke-width':3},text));break;}pricePane.append(group);
   }
  }
  const cursor=svg('line',{x1:x(frames.length-1),x2:x(frames.length-1),y1:top,y2:386,stroke:'#b2c4cf','stroke-dasharray':'2 4'});plot.append(cursor);const inspect=el('p',null,'guide-inspect'),legend=el('div',null,'guide-legend');const signalInfo=el('p',null,'guide-inspect-signals');content.append(inspect,legend,signalInfo);let selected=frames.length-1;
  function choose(i){selected=Math.max(0,Math.min(frames.length-1,i));const p=frames[selected];cursor.setAttribute('x1',x(selected));cursor.setAttribute('x2',x(selected));inspect.textContent=when(p.asOf,frame)+' · 시 '+num(p.open,4)+' / 고 '+num(p.high,4)+' / 저 '+num(p.low,4)+' / 종 '+num(p.close,4)+' · 거래량 '+num(p.volume,0)+' · RSI '+num(p.rsi,1)+' · '+trendLabel[p.trend];signalInfo.textContent=guide.events.filter(e=>e.asOf===p.asOf).map(e=>(e.provisional?'[잠정] ':'[마감] ')+GUIDE_RULES.find(r=>r.key===e.key).label+' — '+e.reason).join(' / ');legend.replaceChildren();for(const l of GUIDE_LINES){const span=el('span',l.label+' '+(p[l.key]==null?'자료 부족':num(p[l.key],4)));span.style.setProperty('--guide-line',l.color);legend.append(span);}}
  const axis=svg('rect',{'data-price-axis':'',x:right,y:top,width:width-right,height:bottom-top,fill:'transparent',role:'slider',tabindex:0,'aria-label':'가격 범위 조절. 위아래 드래그 또는 위아래 방향키, Home으로 자동 범위.','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':50});axis.style.cursor='ns-resize';plot.append(axis);
  const coords=e=>{const rect=plot.getBoundingClientRect();return{x:(e.clientX-rect.left)/rect.width*width,y:(e.clientY-rect.top)/rect.height*420,rect};};
  current={rows:guide.frames,width,rect:plot.getBoundingClientRect(),step,window,price:{min,max}};
  const pick=e=>{if(drag)return;const c=coords(e);if(c.x<right)choose(Math.floor((c.x-left)/step));};plot.onpointermove=pick;plot.onclick=pick;plot.onpointerleave=()=>{if(!drag)choose(frames.length-1);};
  plot.onpointerdown=e=>{if(e.button!==0||e.target===axis&&e.pointerType==='touch'&&pointers.size)return;e.preventDefault();const c=coords(e);if(c.x<right)choose(Math.floor((c.x-left)/step));pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});section.setPointerCapture(e.pointerId);section.dataset.interacting='true';current.rect=c.rect;
   if(pointers.size===2){const points=[...pointers.values()],anchor=Math.max(0,Math.min(1,(((points[0].x+points[1].x)/2-c.rect.left)/c.rect.width*width-left)/(right-left)));drag={...current,kind:'pinch',start:window.start,count:window.count,anchor,distance:Math.max(10,Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y))};}
   else drag={...current,kind:c.x>=right?'price':'pan',x:e.clientX,y:e.clientY,start:window.start,count:window.count};
  };
  plot.addEventListener('wheel',e=>{e.preventDefault();const c=coords(e),delta=Math.max(-300,Math.min(300,e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1)));section.dataset.interacting='true';clearTimeout(wheelTimer);
   if(c.x>=right)view.price=scalePrice({min,max},Math.exp(delta*.002),Math.max(0,Math.min(1,(bottom-c.y)/(bottom-top))));
   else if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))setWindow(guide.frames,view,window.start+(e.deltaX||e.deltaY)/5,window.count);
   else zoomWindow(guide.frames,view,Math.exp(delta*.002),Math.max(0,Math.min(1,(c.x-left)/(right-left))));
   redraw();wheelTimer=setTimeout(interactionDone,180);
  },{passive:false});
  axis.ondblclick=e=>{e.stopPropagation();view.price=null;redraw();};axis.onkeydown=e=>{if(['ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();e.stopPropagation();view.price=e.key==='Home'?null:scalePrice({min,max},e.key==='ArrowUp'?.85:1/.85);redraw();content.querySelector('[data-price-axis]')?.focus({preventScroll:true});}};
  plot.onkeydown=e=>{if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();setWindow(guide.frames,view,window.start+(e.key==='PageUp'?-1:1)*Math.round(window.count*.5),window.count);redraw();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoomWindow(guide.frames,view,e.key==='-'?1.35:.75);redraw();}else if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();choose(e.key==='Home'?0:e.key==='End'?frames.length-1:selected+(e.key==='ArrowLeft'?-1:1));}};choose(selected);
  content.append(el('p','차트 드래그: 과거·최근 이동 · 휠/두 손가락: 시간 확대·축소 · 오른쪽 가격축 드래그/휠: 가격 범위 조절 · 가격축 더블클릭: 자동 범위. 수신된 이력 안에서 이동합니다.','guide-note'));
  const events=guide.events.filter(e=>e.asOf>=frames[0].asOf&&e.asOf<=frames.at(-1).asOf),list=el('div',null,'guide-events');list.append(el('h4','이 구간의 최근 신호 · '+events.length+'건'));
  if(!events.length)list.append(el('p','공개 규칙에 맞는 새 신호가 없습니다.','guide-note'));
  for(const e of events.slice(-8).reverse()){const rule=GUIDE_RULES.find(r=>r.key===e.key),row=el('details');row.append(el('summary',when(e.asOf,frame)+' · '+(e.provisional?'[잠정] ':'[마감] ')+rule.label+' · 신호 가격 '+num(e.close,4)),el('p',e.reason),el('p',rule.rule));list.append(row);}content.append(list);
 }
 const methods=el('details',null,'guide-methods');methods.append(el('summary','자체 계산 규칙 · 잠정 신호와 확정 신호'));
 methods.append(el('p','EMA8·14·21·55는 종가 기준, 최초 N개 종가의 단순평균으로 시작해 α=2/(N+1)로 갱신합니다. SMA100·200은 종가 단순평균입니다. 화면의 표시 봉 수를 바꿔도 전체 수신 이력에서 계산한 값은 유지합니다. 이력 시작일·가격 보정·정규장/장외 설정에 따라 다른 차트와 차이가 생길 수 있습니다.'));
 for(const rule of GUIDE_RULES)methods.append(el('p',rule.label+': '+rule.rule));
 methods.append(el('p','RSI·ATR은 14봉 Wilder 방식. 거래량 비교에서 현재 봉은 제외하며, 4시간봉은 같은 시간대·같은 길이의 직전 20개 봉을 사용합니다. 진행 봉은 아직 누적 중인 거래량으로 비교하며 마감 거래량으로 추정하지 않습니다. 매 조회마다 과거부터 다시 계산하므로 잠정 신호를 영구 저장하지 않습니다.'));
 methods.append(el('p','신호는 해당 봉까지 알려진 자료만 사용합니다. 미래 봉을 보고 과거에 신호를 옮겨 붙이지 않습니다. 다만 원자료 정정·분할 보정·조회 이력 변경으로 재계산 값은 달라질 수 있습니다. 신호 종가는 체결가가 아니며, 거래비용을 반영한 백테스트나 수익률 검증은 아직 하지 않았습니다.'));
 methods.append(el('h4','현재 가격 기준 매매 검토'),el('p',PLAN_RULES),el('p','일봉과 4시간봉은 각 주기의 마감봉·ATR로 따로 계산합니다. 진행 봉 현재가로 돌파 여부와 가격대는 바뀔 수 있습니다. 2봉 확인이 필요한 고점·저점은 확인 전에는 사용하지 않습니다. 저항이 하나뿐이면 2차 목표를 만들지 않습니다. 갭·슬리피지로 실제 매도 가격은 손절 후보보다 불리할 수 있습니다.'));
 methods.append(el('p','캡처를 참고한 독립 규칙이며 유료 지표의 원본 수식과 동일하지 않습니다. 과거 신호의 가상 추적은 기존 규칙(최근 10봉 저가와 진입가−1.5ATR 중 낮은 손절, 2R·3R 목표)을 보존하며 접힌 영역에서만 가격을 보여줍니다. 차트의 후보 가격선은 새 매매 검토 기준입니다. 과거 TP 신호는 기존 규칙으로 계산합니다. 사선 채널·@SR의 비공개 계산식은 구현하지 않았습니다.'));
 for(const[label,url]of[['지지·저항 개념 참고','https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance'],['ATR·목표·손절 활용 참고','https://www.schwab.com/learn/story/average-true-range-indicator-and-volatility']]){const a=el('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';methods.append(a);}
 for(const[label,url]of[['EMA 계산 참고','https://www.tradingview.com/support/solutions/43000592270-exponential-moving-average/'],['ATR 계산 참고','https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/'],['확정봉·리페인팅 참고','https://www.tradingview.com/pine-script-docs/concepts/repainting/']]){const a=el('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';methods.append(a);}section.append(methods);draw();return section;
}
