// Mouse dragging, touch long-press and keyboard ordering share the saved list order.
export function initWatchlistReorder({list,onMove,announce}){
 let session=null,preview=null,timer=null,animation=null,suppressClickUntil=0;
 const rows=()=>[...list.querySelectorAll('[data-watch-row]')];
 const pickAt=target=>target instanceof Element?target.closest('[data-watch-select]'):null;
 function clearMarkers(){for(const row of rows())row.classList.remove('watch-drop-before');list.classList.remove('watch-drop-end');}
 function cancel(){finish(false);}
 function start(pick,x,y,kind,id){
  if(session||!pick||!list.contains(pick)||rows().length<2)return;
  session={pick,row:pick.closest('[data-watch-row]'),key:pick.dataset.watchSelect,x,y,startX:x,startY:y,kind,id,active:false};
  if(kind==='touch')timer=setTimeout(activate,350);
 }
 function activate(){
  timer=null;if(!session||!session.row.isConnected)return cancel();
  const s=session,rect=s.row.getBoundingClientRect();s.active=true;s.offsetY=Math.min(rect.height,Math.max(0,s.startY-rect.top));
  s.row.classList.add('watch-dragging');document.body.classList.add('watch-reordering');
  preview=s.row.cloneNode(true);preview.className='chart-watch-row chart-watch-drag-preview';preview.removeAttribute('data-watch-row');
  preview.setAttribute('aria-hidden','true');preview.inert=true;preview.style.width=rect.width+'px';document.body.append(preview);
  let host=list.parentElement;
  while(host&&host!==document.body){const style=getComputedStyle(host);if(/auto|scroll/.test(style.overflowY)&&host.scrollHeight>host.clientHeight)break;host=host.parentElement;}
  s.host=host&&host!==document.body?host:document.scrollingElement;
  announce('이동할 위치에 놓으세요. Esc 키로 취소할 수 있습니다.');update();animation=requestAnimationFrame(scroll);
 }
 function update(){
  const s=session;if(!s?.active)return;
  const bounds=list.getBoundingClientRect(),viewport=s.host===document.scrollingElement?{top:0,bottom:innerHeight}:s.host.getBoundingClientRect();
  preview.style.left=bounds.left+'px';preview.style.top=(s.y-s.offsetY)+'px';clearMarkers();
  if(s.x<bounds.left-40||s.x>bounds.right+40||s.y<viewport.top-40||s.y>viewport.bottom+40){s.before=undefined;return;}
  const target=rows().find(row=>row!==s.row&&s.y<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);
  s.before=target?.dataset.watchRow??null;
  if(target)target.classList.add('watch-drop-before');else list.classList.add('watch-drop-end');
 }
 function scroll(){
  const s=session;if(!s?.active)return;
  const bounds=list.getBoundingClientRect(),viewport=s.host===document.scrollingElement?{top:0,bottom:innerHeight}:s.host.getBoundingClientRect();
  if(s.x>=bounds.left-40&&s.x<=bounds.right+40){
   const top=Math.max(0,viewport.top),bottom=Math.min(innerHeight,viewport.bottom),edge=32;
   const speed=s.y<top+edge?-Math.min(14,(top+edge-s.y)/2):s.y>bottom-edge?Math.min(14,(s.y-bottom+edge)/2):0;
   if(speed){s.host.scrollTop+=speed;update();}
  }
  animation=requestAnimationFrame(scroll);
 }
 function move(x,y){
  const s=session;if(!s)return;s.x=x;s.y=y;
  if(!s.active&&Math.hypot(x-s.startX,y-s.startY)>7){
   if(s.kind==='touch')return cancel();
   activate();
  }
  if(s.active)update();
 }
 function finish(commit){
  clearTimeout(timer);timer=null;cancelAnimationFrame(animation);animation=null;
  const s=session;session=null;preview?.remove();preview=null;clearMarkers();
  s?.row.classList.remove('watch-dragging');document.body.classList.remove('watch-reordering');
  if(!s?.active)return;
  suppressClickUntil=Date.now()+500;
  if(commit&&s.before!==undefined)onMove(s.key,s.before);
  else announce('관심종목 순서 변경을 취소했습니다.');
 }
 list.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||!e.isPrimary)return;start(pickAt(e.target),e.clientX,e.clientY,'pointer',e.pointerId);});
 document.addEventListener('pointermove',e=>{if(session?.kind!=='pointer'||session.id!==e.pointerId)return;move(e.clientX,e.clientY);if(session?.active)e.preventDefault();},{passive:false});
 document.addEventListener('pointerup',e=>{if(session?.kind==='pointer'&&session.id===e.pointerId)finish(true);});
 document.addEventListener('pointercancel',e=>{if(session?.kind==='pointer'&&session.id===e.pointerId)cancel();});
 list.addEventListener('touchstart',e=>{if(e.touches.length!==1)return cancel();const t=e.changedTouches[0];start(pickAt(e.target),t.clientX,t.clientY,'touch',t.identifier);},{passive:true});
 document.addEventListener('touchmove',e=>{
  if(session?.kind!=='touch')return;if(e.touches.length!==1)return cancel();
  const t=[...e.touches].find(t=>t.identifier===session.id);if(!t)return;
  move(t.clientX,t.clientY);if(session?.active&&e.cancelable)e.preventDefault();
 },{passive:false});
 document.addEventListener('touchend',e=>{if(session?.kind==='touch'&&[...e.changedTouches].some(t=>t.identifier===session.id)){if(session.active&&e.cancelable)e.preventDefault();finish(true);}},{passive:false});
 document.addEventListener('touchcancel',()=>{if(session?.kind==='touch')cancel();});
 list.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 list.addEventListener('contextmenu',e=>{if(session)e.preventDefault();});
 list.addEventListener('dragstart',e=>{if(pickAt(e.target))e.preventDefault();});
 list.addEventListener('keydown',e=>{
  const pick=pickAt(e.target);if(!pick||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();cancel();const order=rows(),index=order.indexOf(pick.closest('[data-watch-row]'));
  if(e.key==='ArrowUp'&&index>0)onMove(pick.dataset.watchSelect,order[index-1].dataset.watchRow);
  if(e.key==='ArrowDown'&&index<order.length-1)onMove(pick.dataset.watchSelect,order[index+2]?.dataset.watchRow??null);
  [...list.querySelectorAll('[data-watch-select]')].find(n=>n.dataset.watchSelect===pick.dataset.watchSelect)?.focus({preventScroll:true});
 });
 document.addEventListener('keydown',e=>{if(session&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();}},{capture:true});
 window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 return {cancel};
}
