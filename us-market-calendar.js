import {calendarWindow,calendarDays,calendarParts,safeCalendarUrl,validUsMarketCalendar} from './us-market-calendar-core.mjs';
import {compareIndicatorForecast} from './calendar-consensus-core.mjs';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;},weekdays=['일','월','화','수','목','금','토'];
export function initUsMarketCalendar(){
 const root=document.getElementById('us-market-calendar');if(!root)return{refresh(){}};let data,offset=0,busy=false,failed=false,renderedFrom=null;
 const dateText=d=>d.slice(5).replace('-','/');
 function draw(){
  const openIds=new Set([...root.querySelectorAll('details[open]')].map(n=>n.dataset.calendarEvent)),range=calendarWindow(Date.now(),offset),days=calendarDays(data,range),head=node('div',null,'us-calendar-heading'),heading=node('div'),tools=node('div',null,'us-calendar-tools');
  heading.append(node('p',range.from.slice(0,4)+' / '+dateText(range.from)+' — '+dateText(range.to),'us-calendar-range'),node('h2','미증시 캘린더'),node('p','뉴욕 시간 기준 (ET) · '+(offset?'선택한 2주':'앞으로 2주'),'us-calendar-subtitle'));
  for(const[label,action]of [['이전 주',()=>offset--],['현재',()=>offset=0],['다음 주',()=>offset++]]){const b=node('button',label);b.type='button';b.onclick=()=>{action();draw();};b.disabled=(label==='이전 주'&&offset<=-1)||(label==='다음 주'&&offset>=3);tools.append(b);}head.append(heading,tools);root.replaceChildren(head);
  renderedFrom=range.from;const list=node('div',null,'us-calendar-days');
  for(const day of days){
   const row=node('section',null,'us-calendar-day'),date=node('div',null,'us-calendar-date'),body=node('div',null,'us-calendar-day-events');date.append(node('strong',dateText(day.date)),node('span',weekdays[new Date(day.date+'T12:00Z').getUTCDay()]));if(day.important)date.append(node('small','★ 중요'));row.dataset.calendarDate=day.date;
   const events=[];for(const e of day.items){if(e.kind!=='earnings'){events.push(e);continue;}let group=events.find(v=>v.kind==='earnings'&&v.timeLabel===e.timeLabel);if(!group){group={...e,id:'earnings:'+day.date+':'+e.timeLabel,earnings:[]};events.push(group);}group.earnings.push(e);}
   for(const e of events){const details=node('details',null,'us-calendar-event'),summary=node('summary'),time=node('span',e.kind==='holiday'?'종일':e.time||e.timeLabel||'시간 미공개','us-calendar-time'),text=node('span',null,'us-calendar-event-copy'),title=e.earnings?e.earnings.map(p=>p.symbol).join(' · ')+' 실적':e.title;
    details.dataset.calendarEvent=e.id;details.dataset.kind=e.kind;details.classList.toggle('is-important',!!e.important);if(openIds.has(e.id))details.open=true;text.append(node('strong',title));if(e.note)text.append(node('small',e.note));summary.append(time,text);details.append(summary);
    const more=node('div',null,'us-calendar-detail');if(e.scheduledAt){const kr=calendarParts(e.scheduledAt,'Asia/Seoul');more.append(node('p','한국 시간 '+dateText(kr.date)+' ('+weekdays[new Date(kr.date+'T12:00Z').getUTCDay()]+') '+kr.time));}
    if(e.earnings){for(const p of e.earnings){const a=node('a',p.symbol+' · '+p.name+(p.epsForecast!=null?' · 예상 EPS $'+p.epsForecast:'')+(p.stale?' · 이전 확인 자료':''));a.href=safeCalendarUrl(p.url);a.target='_blank';a.rel='noopener noreferrer';more.append(a);}more.append(node('p','실적 발표일은 제공처 예상 일정이며 변경될 수 있습니다.'));}
    else{if(e.note)more.append(node('p',e.note));for(const item of e.details||[]){const p=node('p'),comp=compareIndicatorForecast(item.actual,item.forecast);p.append(node('b',item.title+' '),node('span','실제 '+(item.actual??(e.scheduledAt&&Date.parse(e.scheduledAt)<=Date.now()?'결과 확인 중':'발표 전'))+' · 예상 '+(item.forecast??'미제공')+' · 이전 '+(item.previous??'미제공')));if(comp){const label=node('strong',({above:'예측치 상회',equal:'예측치 부합',below:'예측치 하회'})[comp],'us-calendar-forecast '+comp);p.append(label);}more.append(p);}const a=node('a',e.source+' 일정 확인');a.href=safeCalendarUrl(e.url);a.target='_blank';a.rel='noopener noreferrer';more.append(a);}
    if(e.stale)more.append(node('p','새 일정 확인이 지연되어 이전 확인 자료를 표시합니다.'));details.append(more);body.append(details);
   }row.append(date,body);list.append(row);
  }
  if(!days.length)list.append(node('p',data?'선택한 기간의 확인된 일정이 없습니다.':'일정을 확인하고 있습니다.','us-calendar-empty'));root.append(list);
  const footer=node('div',null,'us-calendar-footer'),stamp=data?.collectedAt?calendarParts(data.collectedAt,'Asia/Seoul'):null;footer.append(node('p','경제지표 · 주요 미국 기업 실적 · 휴장·조기 폐장'),node('p',(stamp?'갱신 '+dateText(stamp.date)+' '+stamp.time+' KST · ':'')+(failed||data&&Date.now()-Date.parse(data.collectedAt)>86400000||data?.sources.some(s=>['stale','unavailable'].includes(s.status))?'일부 일정 갱신 지연':'일정 자동 갱신')+' · 시각을 누르면 한국 시간·예측치·출처 확인'));const link=node('a','경제지표 발표·예측치 전체 보기');link.href='./news.html#economic-calendar';footer.append(link);root.append(footer);
 }
 async function refresh(){if(busy)return;busy=true;try{const r=await fetch('./data/us-market-calendar.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const d=await r.json();if(!validUsMarketCalendar(d))throw Error();if(!data||d.collectedAt>=data.collectedAt)data=d;failed=false;}catch{failed=true;}finally{busy=false;draw();}}
 draw();refresh();setInterval(()=>{if(!document.hidden)refresh();},300000);setInterval(()=>{if(!document.hidden&&calendarWindow(Date.now(),offset).from!==renderedFrom)draw();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});return{refresh};
}
