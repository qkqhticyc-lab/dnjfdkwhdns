import {sectorStrength,sectorBenchmark} from './sector-strength-core.mjs';
import {initUsMarketCalendar} from './us-market-calendar.js';
import {loungeStocks,loungeTrend,loungeSectors} from './lounge-core.mjs';
import {INDICATORS} from './quotes-core.mjs';
import {retainLiveItems} from './live-indicators-core.mjs';
import {ENTRY_LABELS,screenEntryType} from './entry-types.mjs';
import {SECTORS} from './sector-core.mjs';
import {formatPrice} from './price-display.mjs';
import {priceCrosshair} from './chart-crosshair.js';
import {NOTIFICATION_KEY,parseNotificationState} from './notifications-core.mjs';
import {calendarStatus,koreaDay,shiftDay,mergeHeadlines,safeNewsUrl,validateMarketNews} from './market-news-core.mjs';
import {compareIndicatorForecast} from './calendar-consensus-core.mjs';

const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;};
const $=id=>document.getElementById(id);
const number=value=>Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:2}):'—';
const percent=value=>Number.isFinite(value)?(value>0?'+':'')+value.toFixed(2)+'%':'—';
const tone=value=>value>0?'lounge-positive':value<0?'lounge-negative':'';
const stamp=at=>Number.isFinite(Date.parse(at))?new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'시각 미제공';
const chartLink=item=>'./charts.html?'+new URLSearchParams({market:item.market,symbol:item.symbol,currency:item.currency,name:item.name,exchange:item.exchange||''});
function storage(key){try{return localStorage.getItem(key);}catch{return null;}}

export async function initLounge(config){
  const usCalendar=initUsMarketCalendar();
  const params=new URLSearchParams(location.search),saved=params.get('market')||storage('lounge-market-v1');
  let market=saved==='US'?'US':'KR',view='new',data={},live,storedBusy=false,liveBusy=false;
  const sectorFeeds=new Map(),sectorPending=new Set();
  const limits={signals:4,calendar:4,news:4,alerts:2,strength:3};
  const sources=['indicators','indicator-history','screener','sectors','sector-benchmarks','news'],failures=new Set();
  const ids=()=>market==='KR'?['kospi','kosdaq']:['sp500','nasdaq'];
  const daily=id=>data.indicators?.items?.find(item=>item.id===id);
  const current=id=>live?.items?.find(item=>item.id===id&&['ok','stale'].includes(item.status))||daily(id);
  const stocks=()=>loungeStocks(data.screener?.items||[],market,$('lounge-type').value);
  const classifications=()=>new Map((data.sectors?.items||[]).map(item=>[item.key,item]));
  function meta(at,failed=false){return stamp(at)+' KST'+(failed?' · 갱신 지연':'');}
  function empty(host,text){host.replaceChildren(element('p',text,'lounge-empty'));}
  function more(key,total){const button=$('lounge-'+key+'-more');button.hidden=total<=limits[key];button.textContent='더보기 ('+Math.min(limits[key],total)+'/'+total+')';}

  function renderTape(){
    const [primary,secondary]=ids(),item=current(primary),host=$('lounge-chart');host.replaceChildren();
    if(!item){empty(host,'지수 자료를 확인하고 있습니다.');return;}
    let points=item.points?.filter(point=>/^\d{14}$/.test(point.at||'')&&Number.isFinite(point.price))||[];
    if(!points.length)points=data['indicator-history']?.items?.find(row=>row.id===primary)?.points||[];
    const lastDay=points.at(-1)?.at?.slice(0,8);
    points=points.filter(point=>point.at?.startsWith(lastDay)&&Number.isFinite(point.price));
    let caption='';
    if(points.length){caption=(item.chartSampled?'실제 수신 시세 표본 ':'최근 분봉 ')+lastDay.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')+' · '+points[0].at.slice(8,10)+':'+points[0].at.slice(10,12)+' ~ '+points.at(-1).at.slice(8,10)+':'+points.at(-1).at.slice(10,12)+' 현지시간'+(item.provider?' · '+item.provider:'');}
    else{points=(daily(primary)?.points||[]).slice(-30).map(point=>({price:point.close,at:point.date}));caption='최근 '+points.length+'개 일봉 · '+(daily(primary)?.asOf||'기준일 미제공');}
    if(points.length>1){
      const width=700,height=130,left=4,right=696,top=8,bottom=108,values=points.map(point=>point.price),low=Math.min(...values),high=Math.max(...values),padding=(high-low||high*.002)*.15,min=low-padding,max=high+padding;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.classList.add('lounge-chart-svg');svg.setAttribute('role','img');svg.setAttribute('aria-label',INDICATORS.find(def=>def.id===primary)?.name+' '+caption);
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',points.map((point,index)=>(index?'L':'M')+(left+index/Math.max(1,points.length-1)*(right-left)).toFixed(2)+','+(bottom-(point.price-min)/(max-min)*(bottom-top)).toFixed(2)).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',item.changePercent>=0?'#d6535e':'#4e85cf');path.setAttribute('stroke-width','2');svg.append(path);
      priceCrosshair(svg,{left,right,top,bottom,min,max,format:number});host.append(svg);
    }else empty(host,item.chartDelayed?'분봉 제공이 지연되고 있습니다. 마지막 확인값과 기준 시각을 표시합니다.':'시세 표본을 모으고 있습니다. 아래 지수는 확인된 최신 제공값입니다.');
    host.append(element('p',caption,'lounge-meta'));
    const direction=Number.isFinite(item.changePercent)?item.changePercent>0?'상승':item.changePercent<0?'하락':'보합':'등락 확인 중';
    host.append(element('p',(market==='KR'?'코스피':'S&P 500')+' '+direction+(item.marketStatus==='OPEN'?' 흐름':item.marketStatus==='CLOSE'?' 마감 기준':' · 최근 제공 기준'),'lounge-hero-title'));
    const quoteHost=$('lounge-quotes');quoteHost.replaceChildren();
    for(const id of [primary,secondary]){const quote=current(id),box=element('div',null,'lounge-quote');box.append(element('small',INDICATORS.find(def=>def.id===id)?.name),element('strong',number(quote?.price)),element('span',percent(quote?.changePercent),tone(quote?.changePercent)),element('p',quote?.quoteAt?'시세 '+meta(quote.quoteAt,quote.status==='stale')+(quote.delayLabel?' · '+quote.delayLabel:'')+(quote.provider?' · '+quote.provider:''):quote?.chartDelayed?'원본 분봉 갱신 지연 · 최신 시세 확인 중':'일봉 '+(quote?.asOf||'미제공'),'lounge-meta'));quoteHost.append(box);}
    renderSectorStrip();
  }
  function renderSectorStrip(){
    const host=$('lounge-sector'),feed=sectorFeeds.get(market);host.replaceChildren();host.className='lounge-sector';
    const link=element('a',feed?(feed.marketStatus==='OPEN'?'장중 업종':feed.marketStatus==='CLOSE'?'마감 업종':'업종 흐름')+' · '+(feed.sessionDate||'기준일 확인 중'):'업종 흐름 불러오는 중','lounge-sector-link');link.href='./sector-map.html?market='+market;link.title='업종지도와 현재 종목 시세 보기';host.append(link);
    if(!feed){link.textContent=failures.has('live-sectors')?'업종지도 · 자료 연결 확인 중':'업종지도 · 현재 업종 불러오는 중';return;}
    const groups=feed.sectors.filter(p=>p.status==='ok'&&Number.isFinite(p.changePercent)).sort((a,b)=>b.changePercent-a.changePercent),stampAt=groups.map(p=>p.quoteAt).filter(Boolean).sort()[0]||feed.collectedAt;
    link.title=(market==='US'?'S&P 500 업종 ETF':'국내 업종 묶음')+' · '+meta(stampAt,failures.has('live-sectors'))+' · 5분 간격 집계';
    for(const row of [...groups.slice(0,2),...groups.slice(-2)].filter((p,i,a)=>a.findIndex(q=>q.id===p.id)===i)){const chip=element('a',row.name+' '+percent(row.changePercent),'lounge-sector-chip '+tone(row.changePercent));chip.href='./sector-map.html?'+new URLSearchParams({market,sector:row.id});chip.title=row.name+' 현재 흐름과 관련 종목';host.append(chip);}
    host.append(element('small',failures.has('live-sectors')?'갱신 지연 · '+stamp(stampAt):stamp(stampAt)+' KST · 업종지도 보기'));
  }
  async function loadSectors(force=false){
    const m=market,old=sectorFeeds.get(m);if(sectorPending.has(m)||!force&&old&&Date.now()-Date.parse(old.collectedAt)<300000)return;
    sectorPending.add(m);
    try{const d=await json(config.supabase.url+'/functions/v1/market-sectors?market='+m,{apikey:config.supabase.publishableKey,Authorization:'Bearer '+config.supabase.edgeAnonKey});if(d.market!==m||!Array.isArray(d.sectors))throw Error();sectorFeeds.set(m,d);failures.delete('live-sectors');}
    catch{failures.add('live-sectors');}finally{sectorPending.delete(m);if(m===market){renderSectorStrip();renderStrength();}}
  }

  function renderStrength(){
    const host=$('lounge-strength-list'),snapshot=loungeStocks(data.screener?.items||[],market),index=data['sector-benchmarks']?.items?.find(p=>p.market===market&&['ok','stale'].includes(p.status)),benchmark=sectorBenchmark(index,market,snapshot.asOf)||sectorBenchmark(daily(ids()[0]),market,snapshot.asOf),result=sectorStrength(snapshot.rows,classifications(),benchmark),feed=sectorFeeds.get(market);
    host.replaceChildren();$('lounge-strength-map').href='./sector-map.html?market='+market;
    $('lounge-strength-basis').textContent=(result.asOf||'기준일 확인 중')+' 마감 기준 · '+(market==='KR'?'코스피':'S&P 500')+' 대비 · 유동성 표본 '+result.measured+'/'+result.available+'종목'+(failures.has('screener')||failures.has('indicators')||failures.has('sectors')?' · 갱신 지연':'');
    const relative=value=>Number.isFinite(value)?(value>0?'+':'')+value.toFixed(1)+'%p':'—';
    for(const g of result.leaders.slice(0,limits.strength)){
      const row=element('article',null,'strength-row'),head=element('div',null,'strength-row-head'),link=element('a',g.name);link.href='./sector-map.html?'+new URLSearchParams({market,sector:g.id});head.append(link,element('span',({leader:'주도',improving:'강세 전환',defensive:'상대 방어'})[g.state],'strength-state strength-'+g.state));if(g.heat)head.append(element('span','추격 주의','strength-heat'));row.append(head);
      for(const[label,value,color]of [['5일 시장 대비',relative(g.relative[5]),tone(g.relative[5])],['20일 시장 대비',relative(g.relative[20]),tone(g.relative[20])],['20일선 위',g.breadth.toFixed(0)+'%',''],['거래 활성도',g.turnoverRatio==null?'—':g.turnoverRatio.toFixed(2)+'배','']]){const metric=element('div',null,'strength-metric');metric.append(element('small',label),element('strong',value,color));row.append(metric);}
      const detail=element('p',g.count+'종목 · 20일 수익률 '+percent(g.returns[20])+' · 60일 시장 대비 '+relative(g.relative[60])+' · 최근 5봉 진입 '+g.recentSignals+'/'+g.count,'strength-detail');
      const liveSector=feed?.sectors.find(s=>s.id===g.id&&s.status==='ok');if(feed?.marketStatus==='OPEN'&&liveSector)detail.append(element('span','장중 업종 '+percent(liveSector.changePercent)+' · '+stamp(liveSector.quoteAt||feed.collectedAt)+' KST','strength-live'));
      row.append(detail);host.append(row);
    }
    if(!result.leaders.length)empty(host,!data.screener?'강세 업종 자료를 확인하고 있습니다.':!benchmark?'동일 마감일의 시장지수 자료를 기다리고 있습니다.':!result.measured?'강세 업종 분석 자료를 전체 종목에서 집계하고 있습니다.':'현재 기준에 맞는 강세 업종이 없습니다. 업종지도에서 전체 흐름을 확인하세요.');
    more('strength',result.leaders.length);
  }

  function renderState(){
    const host=$('lounge-regime'),trend=loungeTrend(daily(ids()[0]),market),snapshot=stocks(),labels={up:'상승 흐름',down:'하락 흐름',mixed:'방향이 엇갈리는 흐름',unknown:'추세 자료 확인 중'};
    host.replaceChildren(element('h3',labels[trend.state],'lounge-regime-title'),element('p','지수 추세 '+(trend.asOf||'미제공')+' · 필터 표본 '+(snapshot.asOf||'미제공'),'lounge-meta'));
    const metric=(label,detail,value)=>{const row=element('div',null,'lounge-metric'),description=element('div');description.append(element('b',label),element('small',detail));row.append(description,element('strong',value));host.append(row);};
    metric('지수 이동평균','마감 지수의 20·60일선 기준',trend.ma60===null?'자료 부족':(trend.close>trend.ma20?'20일선 위':'20일선 아래')+' · '+(trend.close>trend.ma60?'60일선 위':'60일선 아래'));
    metric('상승 정렬 비중','유동성 기준 통과 '+snapshot.rows.length.toLocaleString()+'종목 표본',snapshot.breadth===null?'—':snapshot.breadth.toFixed(0)+'%');
    const vix=current('vix');metric('VIX · 미국 변동성 지수',vix?.quoteAt?'시세 '+meta(vix.quoteAt,vix.status==='stale'):'일봉 '+(vix?.asOf||'미제공'),number(vix?.price));
    metric('당일 확정 진입','기준일 당일 마감봉 · 유동성 기준',snapshot.new.length+'종목');
  }

  function stockRow(item,detail){
    const link=element('a',null,'lounge-stock-row');link.href=chartLink(item);
    const info=element('div',null,'lounge-stock-info');info.append(element('b',item.market==='US'?item.symbol:item.name),element('small',detail));
    const value=element('div',null,'lounge-stock-price');value.append(element('strong',formatPrice(item.price,item.currency)),element('span',percent(item.changePercent),tone(item.changePercent)));link.append(info,value);return link;
  }
  function renderSignals(){
    const snapshot=stocks(),host=$('lounge-signal-list');host.replaceChildren();
    for(const button of document.querySelectorAll('[data-lounge-state]')){const key=button.dataset.loungeState;button.textContent=({new:'최근 신호',active:'추적 중',setup:'셋업'})[key]+' '+snapshot[key].length;button.setAttribute('aria-pressed',String(key===view));}
    $('lounge-screen-basis').textContent=(snapshot.asOf||'기준일 미제공')+' 마감 일봉 · 최근 신호는 당일봉만 · 유동성 기준 적용';
    $('lounge-screen-link').href='./screener.html?market='+market;
    for(const item of snapshot[view].slice(0,limits.signals)){const type=screenEntryType(item.signal),detail=view==='setup'?'이평선 정렬 셋업 · 확정 진입 대기':(ENTRY_LABELS[type]||'진입')+' · '+(item.signal.age===0?'당일봉':item.signal.age+'봉 전')+(item.priority?' · 우선순위 '+item.priority.score+'점':'');host.append(stockRow(item,detail));}
    if(!snapshot[view].length)empty(host,data.screener?view==='new'?'기준일 당일봉에 발생한 진입 신호가 없습니다.':'선택한 유형에 맞는 종목이 없습니다. 진입필터에서 조건을 조정하세요.':'진입필터 자료를 확인하고 있습니다.');
    more('signals',snapshot[view].length);
  }

  function renderCalendar(){
    const feed=data.news?.calendar,today=koreaDay(),host=$('lounge-calendar-list');host.replaceChildren();$('lounge-calendar-basis').textContent='한국 시간 · '+meta(feed?.fetchedAt,feed?.status==='stale'||failures.has('news'));
    const events=(feed?.items||[]).filter(event=>event.major&&event.date>=today&&event.date<=shiftDay(today,7)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'23:59').localeCompare(b.time||'23:59'));
    for(const event of events.slice(0,limits.calendar)){
      const row=element('a',null,'lounge-calendar-row');row.href='./news.html#economic-calendar';const date=element('div',null,'lounge-calendar-date');date.append(element('span',event.date.slice(5,7)+'월'),element('strong',event.date.slice(8)));
      const body=element('div'),state=calendarStatus(event),comparison=compareIndicatorForecast(event.actual,event.forecast);body.append(element('b',(event.country==='KOR'?'한국':'미국')+' · '+event.title),element('small',(event.time||'시각 미정')+' · '+({released:'발표 완료',upcoming:'발표 예정',pending:'결과 확인 중'})[state]));
      const values=element('p');if(event.actual!=null)values.append(element('span','실제 '+event.actual+' '));values.append(element('span','예측 '+(event.forecast??'미제공')+' · 이전 '+(event.previous??'미제공')));body.append(values);
      if(comparison)body.append(element('span',({above:'예측치 상회',equal:'예측치 부합',below:'예측치 하회'})[comparison],'lounge-forecast '+(comparison==='above'?'lounge-positive':comparison==='below'?'lounge-negative':'')));
      row.append(date,body);host.append(row);
    }
    if(!events.length)empty(host,'확인된 주요 경제 일정이 없습니다. 전체 일정에서 자료 상태를 확인하세요.');
    more('calendar',events.length);
  }
  function renderNews(){
    const news=data.news,host=$('lounge-news-list');host.replaceChildren();
    $('lounge-news-basis').textContent='국내·해외 증시 소식 · '+meta(news?.attemptedAt,failures.has('news')||news?.domestic?.status==='stale'||news?.global?.status==='stale');
    const items=mergeHeadlines([...(news?.domestic?.items||[]),...(news?.global?.items||[])]);
    for(const item of items.slice(0,limits.news)){const link=element('a',null,'lounge-news-row');link.href=safeNewsUrl(item.url);link.target='_blank';link.rel='noopener noreferrer';link.append(element('b',item.title),element('small',item.topic+' · '+item.source+' · '+stamp(item.publishedAt)));host.append(link);}
    if(!items.length)empty(host,'최신 뉴스 자료를 확인하고 있습니다.');
    more('news',items.length);
  }

  function renderAlerts(){
    const alerts=parseNotificationState(storage(NOTIFICATION_KEY)).items,list=$('lounge-alert-list');list.replaceChildren();$('lounge-open-alerts').textContent=alerts.length?'알림 '+alerts.length+'개':'알림 보기';
    for(const item of alerts.slice(0,limits.alerts)){const row=element('a',null,'lounge-alert-row'+(item.readAt?'':' is-unread'));row.dataset.loungeNotificationId=item.id;row.href=item.stock?chartLink(item.stock):'./news.html#economic-calendar';row.append(element('b',item.title),element('small',stamp(item.occurredAt)+(item.readAt?' · 읽음':'')));row.onclick=()=>window.dispatchEvent(new CustomEvent('investment-notification-read',{detail:{id:item.id}}));list.append(row);}
    if(!alerts.length)empty(list,'아직 기록된 알림이 없습니다.');
    more('alerts',alerts.length);
  }

  function draw(){
    for(const button of document.querySelectorAll('[data-lounge-market]'))button.setAttribute('aria-pressed',String(button.dataset.loungeMarket===market));
    renderTape();renderStrength();renderState();renderSignals();renderCalendar();renderNews();renderAlerts();
    $('lounge-status').textContent=failures.size?'일부 자료 갱신이 지연됩니다. 확인된 자료와 기준 시각을 유지합니다.':'지수는 30초마다 조회 · 진입 신호는 마감봉 · 일정·뉴스는 게시 자료 기준';
  }
  async function json(url,headers){const response=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Data unavailable');const value=await response.json();if(value?.schemaVersion!==1)throw Error('Invalid dashboard data');return value;}
  async function loadStored(){
    if(storedBusy)return;storedBusy=true;$('lounge-refresh').disabled=true;
    await Promise.all(sources.map(async name=>{try{const value=await json('./data/'+name+'.json');if(name==='news'?!validateMarketNews(value):!Array.isArray(value.items))throw Error('Invalid source');if(!data[name]||!value.collectedAt||!data[name].collectedAt||value.collectedAt>=data[name].collectedAt)data[name]=value;failures.delete(name);}catch{failures.add(name);}}));
    storedBusy=false;$('lounge-refresh').disabled=liveBusy;draw();
  }
  async function loadLive(){
    if(liveBusy)return;liveBusy=true;$('lounge-refresh').disabled=true;
    try{const value=await json(config.supabase.url+'/functions/v1/market-indicators',{apikey:config.supabase.publishableKey,Authorization:'Bearer '+config.supabase.edgeAnonKey});if(value.items?.length!==12)throw Error('Invalid indicator count');live=retainLiveItems(value,live);failures.delete('live');}catch{failures.add('live');if(live)live={...live,items:live.items.map(item=>({...item,status:item.status==='ok'?'stale':item.status}))};}
    liveBusy=false;$('lounge-refresh').disabled=storedBusy;draw();
  }
  for(const button of document.querySelectorAll('[data-lounge-market]'))button.onclick=()=>{market=button.dataset.loungeMarket;limits.signals=4;limits.strength=3;try{localStorage.setItem('lounge-market-v1',market);}catch{}draw();loadSectors();};
  for(const button of document.querySelectorAll('[data-lounge-state]'))button.onclick=()=>{view=button.dataset.loungeState;limits.signals=4;renderSignals();};
  $('lounge-type').onchange=()=>{limits.signals=4;renderSignals();renderState();};
  for(const[key,render]of Object.entries({strength:renderStrength,signals:renderSignals,calendar:renderCalendar,news:renderNews,alerts:renderAlerts}))$('lounge-'+key+'-more').onclick=()=>{limits[key]+=4;render();};
  $('lounge-open-alerts').onclick=event=>{event.stopPropagation();document.getElementById('notification-button')?.click();};
  $('lounge-refresh').onclick=()=>Promise.all([loadStored(),loadLive(),loadSectors(true),usCalendar.refresh()]);
  window.addEventListener('storage',event=>{if(event.key===NOTIFICATION_KEY)renderAlerts();});
  window.addEventListener('investment-notifications-change',renderAlerts);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadLive();loadSectors();}});
  window.addEventListener('focus',()=>{if(!document.hidden){loadLive();loadSectors();}});
  draw();setInterval(()=>{if(!document.hidden)loadLive();},30000);setInterval(()=>{if(!document.hidden)loadStored();},300000);
  setInterval(()=>{if(!document.hidden)loadSectors();},60000);
  await Promise.all([loadStored(),loadLive(),loadSectors()]);
}
