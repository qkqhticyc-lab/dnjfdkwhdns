import{drawingDefaults,parseDrawings,drawingStorageKey,MAX_DRAWINGS,confirmedTrendLines,projectDrawingLine,drawingAnchor}from'./chart-drawing-core.mjs';
const sessions=new Map(),ns='http://www.w3.org/2000/svg';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;},svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;};
function sessionFor(key){
 let session=sessions.get(key),raw=null;try{raw=localStorage.getItem(key);}catch{}if(!session){session={doc:parseDrawings(raw)||drawingDefaults(),mode:'move',draft:null,hover:null,selected:null,undo:[],message:'',saved:true,lastSaved:raw};if(sessions.size>60)sessions.delete(sessions.keys().next().value);sessions.set(key,session);}else if(session.mode==='move'&&!session.draft&&raw!==session.lastSaved){session.doc=parseDrawings(raw);session.undo=[];session.selected=null;session.lastSaved=raw;}return session;
}
export function chartDrawingTools({host,plot,section,rows,geometry:g,identity,format,onInteractionEnd}){
 const key=drawingStorageKey(identity),s=sessionFor(key),menu=el('details'),summary=el('summary','✎ 작도'),popup=el('div'),status=el('p'),counts=el('p'),toolbar=el('div');let gesture=null;
 menu.className='guide-drawing-tools';summary.setAttribute('aria-label','추세선 작도 도구');popup.className='guide-drawing-popup';toolbar.className='guide-drawing-modes';status.className='guide-drawing-status';status.setAttribute('role','status');
 menu.append(summary,popup);popup.append(toolbar);host.replaceChildren(menu);const modeButtons=new Map();
 function positionMenu(){if(!menu.open)return;const r=summary.getBoundingClientRect(),width=Math.min(320,innerWidth-24);popup.style.width=width+'px';popup.style.left=Math.max(12,Math.min(innerWidth-width-12,r.left))+'px';popup.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-220))+'px';popup.style.maxHeight=Math.max(180,innerHeight-parseFloat(popup.style.top)-12)+'px';}
 function setMenu(open){s.menuOpen=open;menu.open=open;positionMenu();}
 summary.onclick=e=>{e.preventDefault();setMenu(!menu.open);};menu.ontoggle=()=>{s.menuOpen=menu.open;positionMenu();};menu.open=!!s.menuOpen;menu.onkeydown=e=>{if(e.key==='Escape'&&menu.open){e.preventDefault();e.stopPropagation();setMenu(false);summary.focus();}};
 function save(){try{const raw=JSON.stringify(s.doc);localStorage.setItem(key,raw);s.lastSaved=raw;s.saved=true;}catch{s.saved=false;s.message='브라우저 저장 실패 · 이 화면에서만 유지됩니다.';}}
 const snapshot=()=>structuredClone(s.doc.lines),remember=old=>{s.undo.push(old);if(s.undo.length>20)s.undo.shift();};
 function cancelDraft(){s.draft=null;s.hover=null;}
 for(const[mode,label]of[['move','이동·조회'],['draw','추세선 그리기'],['edit','선 편집']]){const b=el('button',label);b.type='button';b.dataset.drawingMode=mode;b.onclick=()=>{cancelDraft();s.mode=mode;s.selected=null;s.message='';if(mode!=='move')s.doc.visible=true;save();setMenu(false);render();plot.focus({preventScroll:true});};toolbar.append(b);modeButtons.set(mode,b);}
 const toggles=el('div');toggles.className='guide-drawing-options';const inputs=new Map();
 for(const[name,label]of[['visible','직접 그린 선 표시'],['auto','고점·저점 자동 연결'],['snap','봉 고점·저점에 붙이기'],['extend','오른쪽으로 점선 연장']]){const l=el('label'),input=el('input');input.type='checkbox';input.dataset.drawingOption=name;input.checked=s.doc[name];input.onchange=()=>{s.doc[name]=input.checked;if(name==='visible'&&!input.checked){s.mode='move';s.selected=null;cancelDraft();}save();render();};l.append(input,document.createTextNode(label));toggles.append(l);inputs.set(name,input);}
 const sensitivity=el('label','자동 고저점 확인 '),strength=el('select');strength.setAttribute('aria-label','자동 추세선 고저점 확인 봉 수');for(const n of[2,3,5]){const option=el('option','좌우 '+n+'봉');option.value=n;strength.append(option);}strength.value=s.doc.strength;strength.onchange=()=>{s.doc.strength=Number(strength.value);save();render();};sensitivity.append(strength);toggles.append(sensitivity);popup.append(toggles);
 const actions=el('div');actions.className='guide-drawing-actions';const buttons={};for(const[id,label,run]of[
  ['undo','실행 취소',()=>{if(!s.undo.length)return;s.doc.lines=s.undo.pop();s.selected=null;cancelDraft();save();render();}],
  ['delete','선택선 삭제',()=>{if(!s.selected)return;remember(snapshot());s.doc.lines=s.doc.lines.filter(l=>l.id!==s.selected);s.selected=null;save();render();}],
  ['clear','직접 그린 선 지우기',()=>{if(!s.doc.lines.length)return;remember(snapshot());s.doc.lines=[];s.selected=null;cancelDraft();save();render();}]
 ]){const b=el('button',label);b.type='button';b.dataset.drawingAction=id;b.onclick=run;actions.append(b);buttons[id]=b;}popup.append(actions,el('p','추세선: 두 지점을 차례로 선택. 선 편집: 선을 누른 뒤 끝점을 끌어 수정. Esc 취소, Delete 선택선 삭제, Ctrl+Z 실행 취소.'));
 popup.append(el('p','자동선은 최근 120봉 안에서 좌우 봉으로 확인된 마지막 고점 2개·저점 2개를 연결합니다. 점선은 직선 연장이며 가격 예측·진입 신호가 아닙니다.'));popup.append(el('p','종목·봉 주기별로 이 브라우저에 저장합니다. 일봉과 4시간봉은 따로 관리합니다.'),counts);plot.parentElement.append(status);
 const layer=svg('g',{'data-drawing-layer':'','pointer-events':'none'});plot.append(layer);
 function addLine(line,{automatic=false,draft=false}={}){
  const projected=projectDrawingLine(line,rows,g,{extend:s.doc.extend&&!draft});if(!projected)return false;
  const color=draft?'#f7d98a':automatic?line.kind==='high'?'#f4a69d':'#7ed5c4':s.selected===line.id?'#fff0b0':'#f4c76a',group=svg('g',automatic?{'data-auto-trend':line.kind}:{'data-manual-line':line.id});
  let visible=false;for(const[segment,extended]of[[projected.segment,false],[projected.extension,true]])if(segment){visible=true;const[a,b]=segment;group.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':automatic?1.5:2,'stroke-dasharray':extended||draft?'5 4':'none','vector-effect':'non-scaling-stroke',...(extended?{'data-drawing-extension':''}:{})}));if(!automatic&&!draft&&s.mode==='edit'){const hit=svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'transparent','stroke-width':20,'pointer-events':'stroke'});hit.style.cursor='pointer';group.append(hit);}}
  if(!visible)return false;
  for(const h of projected.handles)if(h.visible&&(automatic||draft||s.mode==='edit'&&s.selected===line.id))group.append(svg('circle',{cx:h.x,cy:h.y,r:automatic?3:draft?4:7,fill:color,stroke:'#101a22','stroke-width':1,...(!automatic&&!draft?{'data-drawing-handle':h.index,'pointer-events':'all'}:{})}));
  group.append(svg('title',{},(automatic?(line.kind==='high'?'확인 고점 연결':'확인 저점 연결'):'직접 그린 추세선')+' · '+line.points.map(p=>p.at+' / '+format(p.price)+(p.confirmedAt?' (확인 '+p.confirmedAt+')':'')).join(' → ')));layer.append(group);return true;
 }
 function render(){
  layer.replaceChildren();let shown=0;const automatic=s.doc.auto?confirmedTrendLines(rows,{through:g.end-1,strength:s.doc.strength}):[];for(const line of automatic)addLine(line,{automatic:true});
  if(s.doc.visible)for(const line of s.doc.lines)if(addLine(line))shown++;
  if(s.draft){if(s.hover&&Date.parse(s.draft.at)!==Date.parse(s.hover.at))addLine({id:'draft',points:[s.draft,s.hover]},{draft:true});else{const i=rows.findIndex(p=>Date.parse(p.asOf)===Date.parse(s.draft.at)),xx=g.left+(i-g.start+.5)*g.step,yy=g.bottom-(s.draft.price-g.min)/(g.max-g.min)*(g.bottom-g.top);if(xx>=g.left&&xx<=g.right&&yy>=g.top&&yy<=g.bottom)layer.append(svg('circle',{cx:xx,cy:yy,r:5,fill:'#f7d98a'}));}}
  plot.dataset.drawingMode=s.mode;for(const[mode,b]of modeButtons)b.setAttribute('aria-pressed',String(s.mode===mode));for(const[name,input]of inputs)input.checked=s.doc[name];buttons.undo.disabled=!s.undo.length;buttons.delete.disabled=!s.selected;buttons.clear.disabled=!s.doc.lines.length;
  const autoCount=s.doc.auto?layer.querySelectorAll('[data-auto-trend]').length:0;counts.textContent='직접 '+shown+'/'+s.doc.lines.length+'개 표시'+(s.doc.auto?' · 자동 '+autoCount+'개 표시'+(automatic.length<2?' · 확인 고저점 부족':autoCount<automatic.length?' · 일부 선은 현재 화면 밖':''):'')+(!s.saved?' · 저장 실패':'');status.textContent=s.message||(s.mode==='draw'?(s.draft?'두 번째 지점을 선택하세요.':'첫 번째 지점을 선택하세요.') :s.mode==='edit'?'편집할 선을 선택하고 끝점을 끌어 주세요.':'');status.hidden=!status.textContent;summary.textContent=s.mode==='draw'?'✎ 작도 중':s.mode==='edit'?'✎ 선 편집':'✎ 작도';summary.title=summary.textContent+' · '+counts.textContent;positionMenu();
 }
 function coords(e){const matrix=plot.getScreenCTM();if(!matrix)return null;const p=plot.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(matrix.inverse());}
 const anchor=e=>{const c=coords(e);return c?drawingAnchor(rows,g,c.x,c.y,{snap:s.doc.snap,currency:identity.currency}):null;};
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
 const busy=()=>{section.dataset.interacting='true';};
 function finish(){gesture=null;delete section.dataset.interacting;onInteractionEnd?.();}
 plot.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;if(menu.open)setMenu(false);const point=anchor(e);if(!point||e.target.closest('[data-volume-divider]'))return;
  const id=e.target.closest('[data-manual-line]')?.dataset.manualLine,handle=e.target.closest('[data-drawing-handle]')?.dataset.drawingHandle;
  if(s.mode==='move'||s.mode==='edit'&&!id)return;consume(e);plot.focus({preventScroll:true});s.message='';
  if(gesture){if(gesture.old)s.doc.lines=gesture.old;const id=gesture.id;gesture=null;try{plot.releasePointerCapture(id);}catch{}cancelDraft();s.mode='move';render();finish();return;}
  busy();plot.setPointerCapture(e.pointerId);
  if(s.mode==='draw')gesture={id:e.pointerId,kind:'draw',start:point,x:e.clientX,y:e.clientY,wasDraft:!!s.draft};
  else{s.selected=id;gesture={id:e.pointerId,kind:handle==null?'select':'handle',handle:Number(handle),old:snapshot()};render();}
 },true);
 plot.addEventListener('pointermove',e=>{
  if(s.mode==='draw'){const point=anchor(e);if(point&&s.draft){s.hover=point;render();}if(gesture?.id===e.pointerId)consume(e);return;}
  if(gesture?.id!==e.pointerId||gesture.kind!=='handle')return;consume(e);const point=anchor(e),line=s.doc.lines.find(l=>l.id===s.selected);if(point&&line&&Date.parse(point.at)!==Date.parse(line.points[1-gesture.handle].at)){line.points[gesture.handle]=point;render();}
 },true);
 function end(e,cancel=false){if(gesture?.id!==e.pointerId)return;consume(e);const own=gesture;gesture=null;try{plot.releasePointerCapture(e.pointerId);}catch{}
  if(cancel){if(own.old)s.doc.lines=own.old;cancelDraft();}
  else if(own.kind==='draw'){
   const point=anchor(e);if(!point){cancelDraft();}else if(!s.draft){s.draft=point;s.hover=null;}else if(Date.parse(point.at)===Date.parse(s.draft.at)){s.message='다른 봉의 지점을 선택하세요.';}else if(s.doc.lines.length>=MAX_DRAWINGS){s.message='직접 그린 선은 최대 '+MAX_DRAWINGS+'개입니다. 먼저 선을 지워 주세요.';cancelDraft();s.mode='move';}else{remember(snapshot());s.doc.lines.push({id:crypto.randomUUID(),points:[s.draft,point]});cancelDraft();s.mode='move';save();}
  }else if(own.kind==='handle'&&JSON.stringify(own.old)!==JSON.stringify(s.doc.lines)){remember(own.old);save();}
  gesture=null;render();finish();
 }
 plot.addEventListener('pointerup',e=>end(e),true);plot.addEventListener('pointercancel',e=>end(e,true),true);plot.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)end(e,true);},true);
 plot.addEventListener('click',e=>{if(s.mode!=='move'&&anchor(e))consume(e);},true);
 plot.addEventListener('keydown',e=>{if(e.key==='Escape'&&(s.mode!=='move'||s.draft)){consume(e);if(gesture){const own=gesture;gesture=null;if(own.old)s.doc.lines=own.old;try{plot.releasePointerCapture(own.id);}catch{}}cancelDraft();s.mode='move';s.selected=null;s.message='';render();finish();}else if(['Delete','Backspace'].includes(e.key)&&s.selected){consume(e);buttons.delete.click();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&s.undo.length){consume(e);buttons.undo.click();}},true);
 render();return{cancel(){cancelDraft();s.mode='move';render();}};
}
