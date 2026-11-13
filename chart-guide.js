import{entryTrigger,ENTRY_KEYS}from'./entry-types.mjs';
import{formatPrice,formatTarget,formatPriceReason,displayPrice}from'./price-display.mjs';
import{viewWindow,setWindow,zoomWindow,scalePrice}from'./chart-viewport.mjs';
import{GUIDE_LINES}from'./chart-guide-core.mjs';
import{STRATEGY_RULES}from'./strategy-core.mjs';
import{buildTradePlan,PLAN_RULES}from'./trade-plan.mjs';
import{entrySnapshot}from'./entry-snapshot.mjs';
const GUIDE_RULES=STRATEGY_RULES.map(r=>['tp1','tp2'].includes(r.key)?{...r,label:r.key==='tp1'?'과거 신호 TP1 · 1.5R':'과거 신호 TP2 · 2.5R'}:r);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;},ns='http://www.w3.org/2000/svg',svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;},num=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:d}):'—';
const viewStates=new Map();
const prefs={frame:'daily',count:120,averages:true,signals:true,patterns:true,levels:true,maxRiskPct:8};
const when=(at,frame)=>frame.timeframe==='1d'?at:new Date(at).toLocaleString('ko-KR',{timeZone:frame.timezone||'UTC',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const trendLabel={up:'상승 정렬',down:'하락 정렬',mixed:'혼조',insufficient:'이동평균 준비 중'};
export function guideView(data,options={}){
 const price=v=>formatPrice(v,data.currency),target=v=>formatTarget(v,data.currency),reason=s=>formatPriceReason(s,data.currency);
 if(options.frame)prefs.frame=options.frame;
 if(options.count)prefs.count=options.count;
 const section=el('section',null,'panel chart-guide');section.setAttribute('aria-label','공개 규칙 보조지표');
 const head=el('div',null,'guide-heading');head.append(el('div','LIVE CHART · 자체 규칙 v3','eyebrow'));
 section.append(head,el('p','가격·거래량·이동평균·매매 신호를 함께 봅니다. 진행 봉의 잠정 신호는 가격 변화에 따라 사라질 수 있습니다.','guide-note'));
 const toggleControls=el('div',null,'guide-toggle-controls');
 const controls=el('div',null,'guide-controls'),tabs=el('div',null,'guide-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','보조지표 봉 주기');
 for(const[key,label]of[['daily','일봉'],['fourHour','4시간봉']]){const b=el('button',label);b.type='button';b.dataset.guideFrame=key;b.onclick=()=>{if(options.onFrame)options.onFrame(key);else{prefs.frame=key;draw();}};tabs.append(b);}
 const range=el('label','표시 봉 수 '),select=el('select');select.setAttribute('aria-label','보조지표 표시 봉 수');for(const count of[22,60,66,120,132,240,252,500]){const o=el('option',count===500?'전체 (최대 500봉)':count+'봉');o.value=count;select.append(o);}select.value=prefs.count;select.onchange=()=>{prefs.count=+select.value;draw();};range.append(select);controls.append(tabs);if(!options.range)controls.append(range);
 for(const[key,label]of[['averages','이동평균'],['signals','신호 표시'],['patterns','삼각수렴·박스 패턴'],['levels','신호 진입가·TP']]){const l=el('label'),input=el('input');input.type='checkbox';input.checked=prefs[key];input.dataset.guideToggle=key;input.onchange=()=>{prefs[key]=input.checked;draw();};l.append(input,document.createTextNode(label));toggleControls.append(l);}if(options.settingsHost)options.settingsHost.replaceChildren(toggleControls);else controls.append(toggleControls);section.append(controls);
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
  else if(drag.kind==='pan'){setWindow(rows,view,drag.start-(e.clientX-drag.x)/rect.width*width/step,drag.count);const dy=e.clientY-drag.y;if(Math.abs(dy)>3){const shift=dy/rect.height*drag.height/drag.priceHeight*(drag.price.max-drag.price.min);view.price={min:drag.price.min+shift,max:drag.price.max+shift};}}
  redraw();
 };
 const endPointer=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);try{section.releasePointerCapture(e.pointerId);}catch{}if(pointers.size){const [id,p]=[...pointers][0];drag={...current,kind:'pan',x:p.x,y:p.y,start:current.window.start,count:current.window.count};}else{drag=null;interactionDone();}};
 section.onpointerup=endPointer;section.onpointercancel=endPointer;section.onlostpointercapture=e=>{if(pointers.has(e.pointerId))endPointer(e);};

 function draw(){
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guideFrame===prefs.frame)));content.replaceChildren();
  const frame=data.frameInfo||data.reversals?.[prefs.frame],guide=data.guide||frame?.guide;
  if(!guide?.frames?.length){content.append(el('p',frame?.reason||'이 주기의 보조지표 자료가 없습니다. 분석 다시 불러오기로 확인해 주세요.','guide-notice'));return;}
  const eventLabel=(key,at)=>ENTRY_KEYS.includes(key)?entryTrigger(guide.frames,guide.frames.findIndex(p=>p.asOf===at),key).label:GUIDE_RULES.find(r=>r.key===key)?.label;
  let frames=guide.frames.slice(-Math.min(prefs.count,500));if(options.range){const end=new Date(guide.frames.at(-1).asOf),months=({'1mo':1,'3mo':3,'6mo':6,'1y':12,'2y':24})[options.range];end.setUTCMonth(end.getUTCMonth()-months);frames=guide.frames.filter(p=>Date.parse(p.asOf)>=end.getTime()).slice(-500);}
  if(!view.count)view.count=frames.length;
  const window=viewWindow(guide.frames,view);frames=guide.frames.slice(window.start,window.end);
  const last=guide.frames.at(-1),title=el('div',null,'guide-latest');title.append(el('strong',trendLabel[last.trend],'guide-trend guide-'+last.trend),el('span',(last.provisional?'진행 봉 · 잠정 ':'최근 마감봉 ')+price(last.close)+' '+data.currency),el('span',(last.start?when(last.start,frame)+' → ':'')+when(last.asOf,frame)+(frame.timeframe==='4h'?' (현지)':'')));content.append(title);
  const active=last.active.map(k=>GUIDE_RULES.find(r=>r.key===k).label);content.append(el('p','현재 충족 조건: '+(active.join(' · ')||'없음')+' · RSI '+num(last.rsi,1)+' · ATR '+num(last.atr,data.currency==='KRW'?0:2)+' · 거래량 '+(last.volumeRatio==null?'비교 자료 부족':num(last.volumeRatio)+'배'),'guide-note'));
  if(frame.status==='stale'||data.status==='stale')content.append(el('p','새 자료 연결 지연 · 이전 분석과 원래 기준 시각을 유지합니다.','guide-notice'));
  content.append(el('p',frame.sessionNote||'진행 봉 포함 · 30초마다 조회','guide-note'));
  if(frame.sourceThrough)content.append(el('p',(frame.timeframe==='4h'?'분봉 기준 ':'가격·일봉 조회 기준 ')+new Date(frame.sourceThrough).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST · 제공처 지연 가능','guide-note'));
  const trade=frames.at(-1).trade,plan=buildTradePlan(guide.frames.slice(0,window.end),{maxRiskPct:prefs.maxRiskPct}),distance=v=>Number.isFinite(v)?((v/plan.entry-1)*100>=0?'+':'')+num((v/plan.entry-1)*100,2)+'%':'—';
  const signal=entrySnapshot(guide,frames.at(-1).asOf),signalCard=el('div',null,'guide-entry');signalCard.dataset.entryStatus=signal?.status||'none';signalCard.dataset.entryType=signal?.entryType||'none';
  signalCard.append(el('h3',view.follow?'최근 진입 신호':'이 시점까지의 최근 진입 신호'));
  if(signal){
   const state=signal.status==='closed'?(signal.exitProvisional?'종료 신호 잠정':'종료된 신호'):signal.status==='active'?(signal.provisional?'잠정 진입 · 진행 봉':'진입 후 추적 중'):'추적 상태 미확인';
   signalCard.append(el('span',state,'guide-entry-state'));const cells=el('div',null,'guide-entry-grid');
   for(const[key,label,value,note]of[
    ['date',signal.entryLabel+' 신호',when(signal.asOf,frame),frame.timeframe==='4h'?'4시간봉 · 현지 시간':'일봉'],
    ['price','신호 기준 진입가',price(signal.entry)+' '+data.currency,signal.provisional?'진행 봉 가격 · 마감 전 변경 가능':'신호 발생 봉의 종가'],
    ['reference',view.follow?'비교 가격':'표시 마지막 봉 가격',price(signal.referencePrice)+' '+data.currency,when(signal.referenceAt,frame)],
    ['tp1','신호 TP1',target(signal.tp1)+' '+data.currency,signal.tp1Hit?'신호 이후 고가 도달 확인':'신호 당시 고정 · 1.5R'],
    ['tp2','신호 TP2',target(signal.tp2)+' '+data.currency,signal.tp2Hit?'신호 이후 고가 도달 확인':'신호 당시 고정 · 2.5R'],
    ['stop','신호 초기 손절',price(signal.initialStop)+' '+data.currency,'신호 당시 변동성 위험 예산'],
    ['change','진입가 대비 등락',(signal.changePct>0?'+':'')+num(signal.changePct,2)+'%','실제 매매 수익률 아님']
   ]){const cell=el('div');cell.dataset.entryValue=key;const valueNode=el('strong',value);if(key==='change')valueNode.className=signal.changePct>0?'guide-up':signal.changePct<0?'guide-down':'';cell.append(el('small',label),valueNode,el('small',note));cells.append(cell);}signalCard.append(cells);
   signalCard.append(el('p',(signal.exitAt?'종료 신호: '+when(signal.exitAt,frame)+' · 이후 가격과도 비교하므로 보유 수익률을 뜻하지 않습니다. ':'')+'신호 진입가는 당시 봉 가격이며 실제 매수가가 아닙니다. 신호 조건과 현재 상태를 아래에서 확인하세요.','guide-note'));
  }else signalCard.append(el('p','이 시점까지 수신된 이력에는 진입 신호가 없습니다.','guide-note'));content.append(signalCard);
  const explanation=el('div',null,'guide-explanation'),recent=signal?guide.events.find(e=>signal.status==='closed'?e.asOf===signal.exitAt&&['exit','patternExit'].includes(e.key)&&(signal.patternType?e.patternType===signal.patternType:!e.patternType):e.asOf===signal.asOf&&e.key===signal.kind):null;
  explanation.append(el('h3',['exit','patternExit'].includes(recent?.key)?'이탈 이유':signal?.status==='active'?'진입 신호 이유':'진입 대기 이유'));
  explanation.append(el('p',recent&&(['exit','patternExit'].includes(recent.key)||signal?.status==='active')?reason((['exit','patternExit'].includes(recent.key)?'':signal?.entryReason||'')+' '+recent.reason):reason(plan.reasons.join(' ')),'guide-note'));content.append(explanation);
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
  const width=Math.max(320,Math.round(options.width||1000)),height=options.height||420,volBottom=height-34,volHeight=Math.max(54,Math.round(height*.14)),scroll=el('div',null,'guide-plot-scroll'),plot=svg('svg',{viewBox:'0 0 '+width+' '+height,role:'img',tabindex:0,'aria-label':(frame.timeframe==='1d'?'일봉':'4시간봉')+' 가격과 이동평균·거래량·보조 신호. 좌우 방향키로 봉 조회.'});scroll.append(plot);content.append(scroll);
  const triangle=frames.at(-1).pattern?.triangle,projected=prefs.patterns&&view.follow&&triangle&&triangle.state!=='failed'?Math.min(30,Math.max(0,Math.ceil(triangle.apex-(window.end-1)))):0;
  const left=20,right=width-82,top=24,bottom=height-volHeight-78,step=(right-left)/(frames.length+projected),x=i=>left+(i+.5)*step;
  const values=[...frames.flatMap(p=>[p.high,p.low,p.close,...(prefs.averages?GUIDE_LINES.map(l=>p[l.key]):[])]),...(prefs.levels?[...(signal?.status==='active'?[signal.entry,signal.tp1,signal.tp2]:[])]:[])].filter(v=>Number.isFinite(v)&&v>0),lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo||hi*.01)*.09,min=view.price?.min??lo-pad,max=view.price?.max??hi+pad,y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  plot.dataset.viewStart=frames[0].asOf;plot.dataset.viewEnd=frames.at(-1).asOf;plot.dataset.viewCount=String(frames.length);plot.dataset.priceMin=String(min);plot.dataset.priceMax=String(max);plot.dataset.follow=String(view.follow);
  const axisStep=data.currency==='KRW'?Math.max(1,10**Math.max(0,Math.floor(Math.log10((max-min)/4))-1)):null;
  for(let i=0;i<5;i++){const value=max-(max-min)*i/4,tick=axisStep?Math.round(value/axisStep)*axisStep:value,yy=y(tick);plot.append(svg('line',{x1:left,x2:right,y1:yy,y2:yy,stroke:'#293b47'}),svg('text',{'data-price-tick':'',x:right+9,y:yy+4,fill:'#b2c4cf','font-size':11},num(tick,data.currency==='KRW'?0:2)));}
  const volMax=Math.max(1,...frames.map(p=>p.volume||0));plot.append(svg('text',{x:left,y:bottom+23,fill:'#b2c4cf','font-size':11},'거래량 · 1.5배 이상 강조'),svg('text',{x:right+9,y:bottom+45,fill:'#b2c4cf','font-size':10},num(volMax,0)));
  const defs=svg('defs'),clip=svg('clipPath',{id:'price-clip-'+viewKey.replace(/[^a-z0-9]/gi,'')});clip.append(svg('rect',{x:left,y:top,width:right-left,height:bottom-top}));defs.append(clip);plot.append(defs);const pricePane=svg('g',{'clip-path':'url(#'+clip.id+')','data-price-pane':''});plot.append(pricePane);
  if(prefs.patterns){
   const shapes=new Map(),add=(type,p)=>{if(p&&p.state!=='failed')shapes.set(type+':'+p.id,{type,p});};
   for(const f of frames){if(f.pattern?.triangleSignal)add('triangle',f.pattern.triangle);if(f.pattern?.boxSignal)add('boxRetest',f.pattern.box);}
   add('triangle',frames.at(-1).pattern?.triangle);add('boxRetest',frames.at(-1).pattern?.box);
   const gx=i=>x(i-window.start),at=(l,i)=>l.m*i+l.b;
   for(const {type,p}of [...shapes.values()].slice(-3)){
    const color=type==='triangle'?'#cda5ff':'#76c4ff',group=svg('g',{'data-pattern-shape':type,'data-pattern-state':p.state});
    if(type==='triangle'){
     const tip=(at(p.upper,p.apex)+at(p.lower,p.apex))/2,end=Math.min(p.end,p.apex);
     group.append(svg('polygon',{points:[[gx(p.start),y(at(p.upper,p.start))],[gx(p.start),y(at(p.lower,p.start))],[gx(p.apex),y(tip)]].map(a=>a.join(',')).join(' '),fill:color,'fill-opacity':.065}),svg('line',{x1:gx(p.start),x2:gx(p.start),y1:y(at(p.upper,p.start)),y2:y(at(p.lower,p.start)),stroke:color,opacity:.35}));
     for(const l of [p.upper,p.lower])group.append(svg('line',{x1:gx(p.start),x2:gx(end),y1:y(at(l,p.start)),y2:y(at(l,end)),stroke:color,'stroke-width':1.5}),svg('line',{'data-pattern-projection':'',x1:gx(end),x2:gx(p.apex),y1:y(at(l,end)),y2:y(tip),stroke:color,'stroke-dasharray':'4 4',opacity:.6}));
     for(const pivot of p.pivots)group.append(svg('circle',{cx:gx(pivot.index),cy:y(pivot.price),r:2.5,fill:color}));
     group.append(svg('title',{},'삼각수렴 '+(p.state==='breakout'?'돌파':'형성 중')+' · 좌우 2봉으로 확인된 고점·저점 연결. 점선은 현재 경계선의 연장 교점이며 미래 가격 예측이 아닙니다.'));
    }else{
     const end=p.retest??Math.min(window.end-1,p.expires),xx=gx(p.start),ww=Math.max(step,gx(end)-xx);
     group.append(svg('rect',{x:xx,y:y(p.top),width:ww,height:y(p.bottom)-y(p.top),fill:color,'fill-opacity':.055,stroke:color,'stroke-width':1.3,'stroke-dasharray':p.state==='armed'?'5 3':'none'}),svg('line',{x1:gx(p.breakout),x2:gx(p.breakout),y1:y(p.top),y2:y(p.bottom),stroke:color,'stroke-dasharray':'2 4',opacity:.6}),svg('title',{},'박스권 '+(p.state==='confirmed'?'재확인':'돌파 · 재확인 대기')+' · 돌파 전 20봉 상단 '+price(p.top)+' / 하단 '+price(p.bottom)+' · 돌파 이후 봉에서 지지 확인.'));
    }
    pricePane.append(group);
   }
  }
  for(const[p,i]of frames.map((p,i)=>[p,i])){const xx=x(i),color=p.close>=(p.open??p.close)?'#ee6972':'#659cf0';if(options.mode!=='line'&&[p.open,p.high,p.low].every(Number.isFinite)){pricePane.append(svg('line',{x1:xx,x2:xx,y1:y(p.high),y2:y(p.low),stroke:color}),svg('rect',{x:xx-Math.max(1,step*.65)/2,y:Math.min(y(p.open),y(p.close)),width:Math.max(1,step*.65),height:Math.max(1,Math.abs(y(p.open)-y(p.close))),fill:color}));}else pricePane.append(svg('circle',{cx:xx,cy:y(p.close),r:1.5,fill:'#d5e2e5'}));if(p.volume!=null)plot.append(svg('rect',{'data-guide-volume':'',x:xx-step*.32,y:volBottom-p.volume/volMax*volHeight,width:Math.max(1,step*.64),height:p.volume/volMax*volHeight,fill:p.volumeRatio>=1.5?'#e4ba63':color,opacity:p.volumeRatio>=1.5?1:.5}));}
  function line(key,color,dash){let path='',open=false;for(const[p,i]of frames.map((p,i)=>[p,i])){if(!Number.isFinite(p[key])){open=false;continue;}path+=(open?'L':'M')+x(i).toFixed(2)+','+y(p[key]).toFixed(2)+' ';open=true;}if(path)pricePane.append(svg('path',{'data-guide-line':key,d:path,fill:'none',stroke:color,'stroke-width':key==='sma200'?2.5:1.5,...(dash?{'stroke-dasharray':dash}:{})}));}
  if(options.mode==='line')line('close','#70d7bd');
  if(prefs.averages)for(const l of GUIDE_LINES)line(l.key,l.color);
  if(prefs.levels&&signal?.status==='active'){for(const [key,label]of[['tp1','신호 TP1'],['tp2','신호 TP2']])if(Number.isFinite(signal[key]))pricePane.append(svg('line',{'data-signal-target':key,x1:x(Math.max(0,frames.length-20)),x2:right,y1:y(displayPrice(signal[key],data.currency)),y2:y(displayPrice(signal[key],data.currency)),stroke:'#c6a2ff','stroke-dasharray':'3 5'}),svg('text',{x:right-5,y:y(displayPrice(signal[key],data.currency))-5,fill:'#c6a2ff','font-size':10,'text-anchor':'end'},label+' '+target(signal[key]))); const start=Math.max(0,frames.findIndex(p=>p.asOf>=signal.asOf));pricePane.append(svg('line',{'data-guide-entry-line':'',x1:x(start),x2:right,y1:y(signal.entry),y2:y(signal.entry),stroke:'#70d7bd','stroke-dasharray':'3 5'}),svg('text',{x:x(start)+4,y:y(signal.entry)+13,fill:'#70d7bd','font-size':10},'신호 진입가 '+price(signal.entry)));}
  const ticks=width<600?2:4;for(let i=0;i<=ticks;i++){const k=Math.round((frames.length-1)*i/ticks);plot.append(svg('text',{x:x(k),y:height-12,fill:'#b2c4cf','font-size':10,'text-anchor':i===0?'start':i===ticks?'end':'middle'},when(frames[k].asOf,frame)));}
  if(prefs.signals){const candidates=frames.map((p,i)=>({p,i})).filter(v=>v.p.signals.length),isEntry=p=>{const key=ENTRY_KEYS.find(k=>p.signals.includes(k));return key&&['breakout','pullback','triangle','boxRetest'].includes(entryTrigger(guide.frames,guide.frames.findIndex(f=>f.asOf===p.asOf),key).type);},marked=[...candidates.filter(v=>isEntry(v.p)).slice(-12).reverse(),...candidates.filter(v=>!isEntry(v.p)).slice(-6).reverse()],occupied=[];
   for(const {p,i} of marked){const rules=p.signals.map(k=>GUIDE_RULES.find(r=>r.key===k)),r=ENTRY_KEYS.map(k=>rules.find(r=>r.key===k)).find(Boolean)||rules[0],trigger=ENTRY_KEYS.includes(r.key)?entryTrigger(guide.frames,guide.frames.findIndex(f=>f.asOf===p.asOf),r.key):null,highlight=trigger&&['breakout','pullback','triangle','boxRetest'].includes(trigger.type),color=trigger?.type==='triangle'?'#cda5ff':trigger?.type==='boxRetest'?'#76c4ff':trigger?.type==='breakout'?'#f7bb4a':trigger?.type==='pullback'?'#60d8bb':trigger?'#9caec4':r.color,event=guide.events.find(e=>e.asOf===p.asOf&&e.key===r.key),xx=x(i),anchor=highlight?y(p.low||p.close)+7:y(p.high||p.close)-4,text=(p.provisional?'잠정 ':'')+eventLabel(r.key,p.asOf)+(event?.count?' ×'+event.count:'')+(rules.length>1?' +'+(rules.length-1):''),width=Math.max(70,[...text].reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?11:6.2),0)),tx=Math.min(right-width/2,Math.max(left+width/2,xx)),group=svg('g',{'data-guide-signal':p.asOf,...(trigger?{'data-entry-marker':trigger.type}:{})});
    group.append(svg('circle',{cx:xx,cy:anchor,r:3,fill:color}),svg('title',{},when(p.asOf,frame)+' · '+guide.events.filter(e=>e.asOf===p.asOf).map(e=>(e.provisional?'[잠정] ':'')+eventLabel(e.key,e.asOf)+': '+reason(e.reason)).join(' / ')));
    for(const offset of(highlight?[22,42,62,82,-20,-40,-60,-80]:[-12,-30,-48,-66,22,40,58,76])){const yy=anchor+offset,box={left:tx-width/2,right:tx+width/2,top:yy-11,bottom:yy+3};if(yy<16||yy>bottom-5||occupied.some(b=>box.left<b.right+5&&box.right>b.left-5&&box.top<b.bottom+3&&box.bottom>b.top-3))continue;occupied.push(box);group.append(svg('line',{x1:xx,x2:tx,y1:anchor,y2:yy,stroke:color,opacity:.5}),...(highlight?[svg('rect',{x:box.left-4,y:box.top-2,width:width+8,height:18,rx:4,fill:'#10252d',stroke:color,'stroke-width':.7})]:[]),svg('text',{x:tx,y:yy,fill:color,'font-size':highlight?11:10,'font-weight':highlight?700:400,'text-anchor':'middle','paint-order':'stroke',stroke:'#101a22','stroke-width':3},text));break;}pricePane.append(group);
   }
  }
  const cursor=svg('line',{x1:x(frames.length-1),x2:x(frames.length-1),y1:top,y2:volBottom,stroke:'#b2c4cf','stroke-dasharray':'2 4'});plot.append(cursor);const inspect=el('p',null,'guide-inspect'),legend=el('div',null,'guide-legend');const signalInfo=el('p',null,'guide-inspect-signals');content.append(inspect,legend,signalInfo);let selected=frames.length-1;
  function choose(i){selected=Math.max(0,Math.min(frames.length-1,i));const p=frames[selected];cursor.setAttribute('x1',x(selected));cursor.setAttribute('x2',x(selected));inspect.textContent=when(p.asOf,frame)+' · 시 '+price(p.open)+' / 고 '+price(p.high)+' / 저 '+price(p.low)+' / 종 '+price(p.close)+' · 거래량 '+num(p.volume,0)+' · RSI '+num(p.rsi,1)+' · '+trendLabel[p.trend];signalInfo.textContent=guide.events.filter(e=>e.asOf===p.asOf).map(e=>(e.provisional?'[잠정] ':'[마감] ')+eventLabel(e.key,e.asOf)+' — '+reason(e.reason)).join(' / ');legend.replaceChildren();for(const l of GUIDE_LINES){const span=el('span',l.label+' '+(p[l.key]==null?'자료 부족':price(p[l.key])));span.style.setProperty('--guide-line',l.color);legend.append(span);}}
  const axis=svg('rect',{'data-price-axis':'',x:right,y:top,width:width-right,height:bottom-top,fill:'transparent',role:'slider',tabindex:0,'aria-label':'가격 범위 조절. 위아래 드래그 또는 위아래 방향키, Home으로 자동 범위.','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':50});axis.style.cursor='ns-resize';plot.append(axis);
  const coords=e=>{const rect=plot.getBoundingClientRect();return{x:(e.clientX-rect.left)/rect.width*width,y:(e.clientY-rect.top)/rect.height*height,rect};};
  current={rows:guide.frames,width,height,priceHeight:bottom-top,rect:plot.getBoundingClientRect(),step,window,price:{min,max}};
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
  content.append(el('p','차트 드래그: 좌우·상하 이동 · 휠/두 손가락: 시간 확대·축소 · 오른쪽 가격축 드래그/휠: 가격 범위 조절 · 가격축 더블클릭: 자동 범위. 수신된 이력 안에서 이동합니다.','guide-note'));
  const events=guide.events.filter(e=>e.asOf>=frames[0].asOf&&e.asOf<=frames.at(-1).asOf),list=el('div',null,'guide-events');list.append(el('h4','이 구간의 최근 신호 · '+events.length+'건'));
  if(!events.length)list.append(el('p','공개 규칙에 맞는 새 신호가 없습니다.','guide-note'));
  for(const e of events.slice(-8).reverse()){const rule=GUIDE_RULES.find(r=>r.key===e.key),row=el('details');row.append(el('summary',when(e.asOf,frame)+' · '+(e.provisional?'[잠정] ':'[마감] ')+rule.label+' · 신호 가격 '+price(e.close)),el('p',reason(e.reason)),el('p',rule.rule));list.append(row);}content.append(list);
  if(options.dashboardHost){
   const opened=[...(options.notesHost?.querySelectorAll('details')||[])].map(d=>d.open);options.dashboardHost.replaceChildren();const more=el('details',null,'guide-more');more.append(el('summary','시세·추세 상세 · 최근 신호'));
   for(const child of [...content.children]){
    if(child.matches('.guide-latest,.guide-entry,.guide-explanation'))options.dashboardHost.append(child);
    else if(child.matches('p.guide-note,.guide-notice,.guide-events'))more.append(child);
   }
   options.notesHost?.replaceChildren();options.settingsHost?.append(methods);options.notesHost?.querySelectorAll('details').forEach((d,i)=>d.open=!!opened[i]);
   options.navigationHost?.replaceChildren(navigation);
  }
 }
 const methods=el('details',null,'guide-methods');methods.append(el('summary','자체 계산 규칙 · 잠정 신호와 확정 신호'));
 methods.append(el('p','EMA8·14·21·55는 종가 기준, 최초 N개 종가의 단순평균으로 시작해 α=2/(N+1)로 갱신합니다. SMA100·200은 종가 단순평균입니다. 화면의 표시 봉 수를 바꿔도 전체 수신 이력에서 계산한 값은 유지합니다. 이력 시작일·가격 보정·정규장/장외 설정에 따라 다른 차트와 차이가 생길 수 있습니다.'));
 for(const rule of GUIDE_RULES)methods.append(el('p',rule.label+': '+rule.rule));
 methods.append(el('p','RSI·ATR은 14봉 Wilder 방식. 거래량 비교에서 현재 봉은 제외하며, 4시간봉은 같은 시간대·같은 길이의 직전 20개 봉을 사용합니다. 진행 봉은 아직 누적 중인 거래량으로 비교하며 마감 거래량으로 추정하지 않습니다. 매 조회마다 과거부터 다시 계산하므로 잠정 신호를 영구 저장하지 않습니다.'));
 methods.append(el('p','신호는 해당 봉까지 알려진 자료만 사용합니다. 미래 봉을 보고 과거에 신호를 옮겨 붙이지 않습니다. 다만 원자료 정정·분할 보정·조회 이력 변경으로 재계산 값은 달라질 수 있습니다. 신호 종가는 체결가가 아니며, 거래비용을 반영한 백테스트나 수익률 검증은 아직 하지 않았습니다.'));
 methods.append(el('h4','현재 가격 기준 매매 검토'),el('p',PLAN_RULES),el('p','일봉과 4시간봉은 각 주기의 마감봉·ATR로 따로 계산합니다. 진행 봉 현재가로 돌파 여부와 가격대는 바뀔 수 있습니다. 2봉 확인이 필요한 고점·저점은 확인 전에는 사용하지 않습니다. 목표가는 도달 예측이 아닌 위험 예산이며 저항 돌파가 선행되어야 할 수 있습니다. 갭·슬리피지로 실제 매도 가격은 손절 후보보다 불리할 수 있습니다.'));
 methods.append(el('p','캡처를 참고한 독립 규칙이며 유료 지표의 원본 수식과 동일하지 않습니다. 신호 진입은 해당 봉 종가로 가상 추적하며 최근 5봉 저점을 참고해 초기 위험을 0.75~1.5ATR로 제한합니다. TP1·TP2는 초기 위험의 1.5배·2.5배로 고정합니다. 삼각수렴·박스 재확인은 각각 별도로 추적하며, 새로운 패턴은 수익성 검증 전의 실험 규칙입니다. 사선 채널·@SR의 비공개 계산식은 구현하지 않았습니다.'));
 for(const[label,url]of[['지지·저항 개념 참고','https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance'],['ATR·목표·손절 활용 참고','https://www.schwab.com/learn/story/average-true-range-indicator-and-volatility']]){const a=el('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';methods.append(a);}
 for(const[label,url]of[['EMA 계산 참고','https://www.tradingview.com/support/solutions/43000592270-exponential-moving-average/'],['ATR 계산 참고','https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/'],['확정봉·리페인팅 참고','https://www.tradingview.com/pine-script-docs/concepts/repainting/']]){const a=el('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';methods.append(a);}section.append(methods);draw();return section;
}
