export function initNavigation(config){
 const nav=document.querySelector('header nav'),path=location.pathname.split('/').pop()||'index.html',groups=[];
 function link(file,label){const a=document.createElement('a');a.href='./'+file;a.textContent=label;if(path===file)a.setAttribute('aria-current','page');return a;}
 function closeAll(except){for(const g of groups)if(g!==except)g.set(false);}
 function group(id,label,items){const host=document.createElement('div'),button=document.createElement('button'),menu=document.createElement('div');host.className='nav-group';button.type='button';button.className='nav-group-button';button.textContent=label+' ⌄';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','nav-'+id);menu.id='nav-'+id;menu.className='nav-submenu';menu.hidden=true;for(const[file,text]of items)menu.append(link(file,text));if(items.some(([file])=>file===path))button.classList.add('is-current');let timer,hoverOpened=false;
  const position=()=>{const r=button.getBoundingClientRect(),width=Math.min(220,innerWidth-24);menu.style.width=width+'px';menu.style.left=Math.max(12,Math.min(r.left,innerWidth-width-12))+'px';menu.style.top=r.bottom+6+'px';};
  const g={set(open){clearTimeout(timer);menu.hidden=!open;if(!open)hoverOpened=false;button.setAttribute('aria-expanded',String(open));if(open)position();},position};groups.push(g);
  button.onclick=()=>{const open=menu.hidden||hoverOpened;hoverOpened=false;closeAll(g);g.set(open);};host.onpointerenter=e=>{if(e.pointerType==='mouse'&&matchMedia('(hover:hover)').matches){closeAll(g);if(menu.hidden){g.set(true);hoverOpened=true;}}};host.onpointerleave=()=>{timer=setTimeout(()=>{if(!host.matches(':hover')&&!host.contains(document.activeElement))g.set(false);},150);};
  host.onfocusout=()=>setTimeout(()=>{if(!host.contains(document.activeElement))g.set(false);},0);host.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();g.set(false);button.focus();}else if(e.target===button&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();closeAll(g);g.set(true);(e.key==='ArrowDown'?menu.firstElementChild:menu.lastElementChild)?.focus();}};
  host.append(button,menu);nav.append(host);
 }
 nav.replaceChildren(link('index.html','시장 현황'),link('charts.html','차트'),link('chart-compare.html','차트비교'),link('screener.html','진입필터'));
 group('references','참고자료',[['etfs.html','ETF 도우미'],['reports.html','리포트']]);nav.append(link('credit.html','신용잔고'));
 group('journals','매매일지',[['club.html','정버핏모임'],['community.html','나의 반성일기'],['journals.html','당신들의 반성일기']]);
 const account=document.createElement('a');account.href=config.privateJournalUrl;account.textContent='계좌 매매일지 🔒';account.dataset.private='';account.hidden=true;nav.append(account);
 document.addEventListener('click',e=>{if(!nav.contains(e.target))closeAll();});const reposition=()=>groups.forEach(g=>g.position());window.addEventListener('resize',()=>closeAll());window.addEventListener('scroll',reposition,{passive:true});nav.addEventListener('scroll',reposition,{passive:true});
 const current=nav.querySelector('[aria-current="page"]'),target=current?.closest('.nav-group')||current;if(target)nav.scrollLeft=Math.max(0,target.offsetLeft-nav.offsetLeft-nav.clientWidth+target.offsetWidth+12);
}
