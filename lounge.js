import {loungeStocks,loungeTrend,loungeSectors} from './lounge-core.mjs';
import {INDICATORS} from './quotes-core.mjs';
import {retainLiveItems} from './live-indicators-core.mjs';
import {ENTRY_LABELS,screenEntryType} from './entry-types.mjs';
import {SECTORS} from './sector-core.mjs';
import {formatPrice} from './price-display.mjs';
import {priceCrosshair} from './chart-crosshair.js';
import {WATCH_KEY,parseWatchlist,watchKey} from './watchlist-core.mjs';
import {initWatchlistQuotes,watchQuoteText} from './watchlist-quotes.js';
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
  const params=new URLSearchParams(location.search),saved=params.get('market')||storage('lounge-market-v1');
  let market=saved==='US'?'US':'KR',view='new',data={},live,storedBusy=false,liveBusy=false;
  const sources=['indicators','indicator-history','screener','sectors','news'],failures=new Set();
  const ids=()=>market==='KR'?['kospi','kosdaq']:['sp500','nasdaq'];
  const daily=id=>data.indicators?.items?.find(item=>item.id===id);
  const current=id=>live?.items?.find(item=>item.id===id&&['ok','stale'].includes(item.status))||daily(id);
  const stocks=()=>loungeStocks(data.screener?.items||[],market,$('lounge-type').value);
  const classifications=()=>new Map((data.sectors?.items||[]).map(item=>[item.key,item]));
  const quotes=initWatchlistQuotes(config,()=>renderWatch());
  let watchlist=[];
  function syncWatchlist(){try{watchlist=parseWatchlist(storage(WATCH_KEY)||'{"schemaVersion":1,"items":[]}');}catch{watchlist=[];}quotes.setItems(watchlist);renderWatch();}
  function meta(at,failed=false){return stamp(at)+' KST'+(failed?' · 갱신 지연':'');}
  function empty(host,text){host.replaceChildren(element('p',text,'lounge-empty'));}

  function renderTape(){
    const [primary,secondary]=ids(),item=current(primary),host=$('lounge-chart');host.replaceChildren();
    if(!item){empty(host,'지수 자료를 확인하고 있습니다.');return;}
    let points=item.points?.filter(point=>/^\d{14}$/.test(point.at||'')&&Number.isFinite(point.price))||[];
    if(!points.length)points=data['indicator-history']?.items?.find(row=>row.id===primary)?.points||[];
    const lastDay=points.at(-1)?.at?.slice(0,8);
    points=points.filter(point=>point.at?.startsWith(lastDay)&&Number.isFinite(point.price));
    let caption='';
    if(points.length){caption='최근 분봉 '+lastDay.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')+' · '+points[0].at.slice(8,10)+':'+points[0].at.slice(10,12)+' ~ '+points.at(-1).at.slice(8,10)+':'+points.at(-1).at.slice(10,12)+' 현지시간';}
    else{points=(daily(primary)?.points||[]).slice(-30).map(point=>({price:point.close,at:point.date}));caption='최근 '+points.length+'개 일봉 · '+(daily(primary)?.asOf||'기준일 미제공');}
    if(points.length){
      const width=700,height=130,left=4,right=696,top=8,bottom=108,values=points.map(point=>point.price),low=Math.min(...values),high=Math.max(...values),padding=(high-low||high*.002)*.15,min=low-padding,max=high+padding;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.classList.add('lounge-chart-svg');svg.setAttribute('role','img');svg.setAttribute('aria-label',INDICATORS.find(def=>def.id===primary)?.name+' '+caption);
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',points.map((point,index)=>(index?'L':'M')+(left+index/Math.max(1,points.length-1)*(right-left)).toFixed(2)+','+(bottom-(point.price-min)/(max-min)*(bottom-top)).toFixed(2)).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',item.changePercent>=0?'#d6535e':'#4e85cf');path.setAttribute('stroke-width','2');svg.append(path);
      priceCrosshair(svg,{left,right,top,bottom,min,max,format:number});host.append(svg);
    }
    host.append(element('p',caption,'lounge-meta'));
    const direction=Number.isFinite(item.changePercent)?item.changePercent>0?'상승':item.changePercent<0?'하락':'보합':'등락 확인 중';
    host.append(element('p',(market==='KR'?'코스피':'S&P 500')+' '+direction+(item.marketStatus==='OPEN'?' 흐름':item.marketStatus==='CLOSE'?' 마감 기준':' · 최근 제공 기준'),'lounge-hero-title'));
    const quoteHost=$('lounge-quotes');quoteHost.replaceChildren();
    for(const id of [primary,secondary]){const quote=current(id),box=element('div',null,'lounge-quote');box.append(element('small',INDICATORS.find(def=>def.id===id)?.name),element('strong',number(quote?.price)),element('span',percent(quote?.changePercent),tone(quote?.changePercent)),element('p',quote?.quoteAt?'시세 '+meta(quote.quoteAt,quote.status==='stale')+(quote.delayMinutes>0?' · '+quote.delayMinutes+'분 지연':''):'일봉 '+(quote?.asOf||'미제공'),'lounge-meta'));quoteHost.append(box);}
    const snapshot=stocks(),groups=loungeSectors(snapshot.rows,classifications()),sectors=$('lounge-sector');sectors.replaceChildren();sectors.className='lounge-sector';
    if(groups.length){sectors.append(element('b','업종 표본 · '+snapshot.asOf));for(const group of [...groups.slice(0,2),...groups.slice(-2)].filter((group,index,list)=>list.findIndex(other=>other.id===group.id)===index)){const chip=element('span',SECTORS[group.id]+' '+percent(group.average),tone(group.average));chip.title='유동성 기준 통과 '+group.count+'종목의 당일 등락률 단순 평균';sectors.append(chip);}}
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

  function stockRow(item,detail,quote){
    const link=element('a',null,'lounge-stock-row');link.href=chartLink(item);
    const info=element('div',null,'lounge-stock-info');info.append(element('b',item.market==='US'?item.symbol:item.name),element('small',detail));
    const value=element('div',null,'lounge-stock-price');value.append(element('strong',formatPrice(quote?.price??item.price,item.currency)),element('span',quote?watchQuoteText(quote):percent(item.changePercent),tone(quote?.changePercent??item.changePercent)));link.append(info,value);return link;
  }
  function renderSignals(){
    const snapshot=stocks(),host=$('lounge-signal-list');host.replaceChildren();
    for(const button of document.querySelectorAll('[data-lounge-state]')){const key=button.dataset.loungeState;button.textContent=({new:'최근 신호',active:'추적 중',setup:'셋업'})[key]+' '+snapshot[key].length;button.setAttribute('aria-pressed',String(key===view));}
    $('lounge-screen-basis').textContent=(snapshot.asOf||'기준일 미제공')+' 마감 일봉 · 최근 신호는 당일봉만 · 유동성 기준 적용';
    $('lounge-screen-link').href='./screener.html?market='+market;
    for(const item of snapshot[view].slice(0,4)){const type=screenEntryType(item.signal),detail=view==='setup'?'이평선 정렬 셋업 · 확정 진입 대기':(ENTRY_LABELS[type]||'진입')+' · '+(item.signal.age===0?'당일봉':item.signal.age+'봉 전')+(item.priority?' · 우선순위 '+item.priority.score+'점':'');host.append(stockRow(item,detail));}
    if(!snapshot[view].length)empty(host,data.screener?view==='new'?'기준일 당일봉에 발생한 진입 신호가 없습니다.':'선택한 유형에 맞는 종목이 없습니다. 진입필터에서 조건을 조정하세요.':'진입필터 자료를 확인하고 있습니다.');
  }

  function renderCalendar(){
    const feed=data.news?.calendar,today=koreaDay(),host=$('lounge-calendar-list');host.replaceChildren();$('lounge-calendar-basis').textContent='한국 시간 · '+meta(feed?.fetchedAt,feed?.status==='stale'||failures.has('news'));
    const events=(feed?.items||[]).filter(event=>event.major&&event.date>=today&&event.date<=shiftDay(today,7)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'23:59').localeCompare(b.time||'23:59'));
    for(const event of events.slice(0,4)){
      const row=element('a',null,'lounge-calendar-row');row.href='./news.html#economic-calendar';const date=element('div',null,'lounge-calendar-date');date.append(element('span',event.date.slice(5,7)+'월'),element('strong',event.date.slice(8)));
      const body=element('div'),state=calendarStatus(event),comparison=compareIndicatorForecast(event.actual,event.forecast);body.append(element('b',(event.country==='KOR'?'한국':'미국')+' · '+event.title),element('small',(event.time||'시각 미정')+' · '+({released:'발표 완료',upcoming:'발표 예정',pending:'결과 확인 중'})[state]));
      const values=element('p');if(event.actual!=null)values.append(element('span','실제 '+event.actual+' '));values.append(element('span','예측 '+(event.forecast??'미제공')+' · 이전 '+(event.previous??'미제공')));body.append(values);
      if(comparison)body.append(element('span',({above:'예측치 상회',equal:'예측치 부합',below:'예측치 하회'})[comparison],'lounge-forecast '+(comparison==='above'?'lounge-positive':comparison==='below'?'lounge-negative':'')));
      row.append(date,body);host.append(row);
    }
    if(!events.length)empty(host,'확인된 주요 경제 일정이 없습니다. 전체 일정에서 자료 상태를 확인하세요.');
  }
  function renderNews(){
    const news=data.news,host=$('lounge-news-list');host.replaceChildren();
    $('lounge-news-basis').textContent='국내·해외 증시 소식 · '+meta(news?.attemptedAt,failures.has('news')||news?.domestic?.status==='stale'||news?.global?.status==='stale');
    const items=mergeHeadlines([...(news?.domestic?.items||[]),...(news?.global?.items||[])]);
    for(const item of items.slice(0,4)){const link=element('a',null,'lounge-news-row');link.href=safeNewsUrl(item.url);link.target='_blank';link.rel='noopener noreferrer';link.append(element('b',item.title),element('small',item.topic+' · '+item.source+' · '+stamp(item.publishedAt)));host.append(link);}
    if(!items.length)empty(host,'최신 뉴스 자료를 확인하고 있습니다.');
  }

  function renderWatch(){
    const host=$('lounge-watch-list');host.replaceChildren();
    for(const item of watchlist.slice(0,3)){const quote=quotes.get(item);const row=stockRow(item,item.market+' · '+(quote?.asOf?meta(quote.asOf,quote.status==='stale'):'시세 확인 중'),quote||{price:null,changePercent:null});row.dataset.loungeWatch=watchKey(item);host.append(row);}
    if(!watchlist.length)empty(host,'차트에서 ☆를 눌러 관심종목을 등록하세요.');
    const alerts=parseNotificationState(storage(NOTIFICATION_KEY)).items.filter(item=>!item.readAt),list=$('lounge-alert-list');list.replaceChildren();$('lounge-open-alerts').textContent=alerts.length?'알림 '+alerts.length+'개':'알림 보기';
    for(const item of alerts.slice(0,2)){const row=element('a',null,'lounge-alert-row is-unread');row.href=item.stock?chartLink(item.stock):'./news.html#economic-calendar';row.append(element('b',item.title),element('small',stamp(item.occurredAt)));row.onclick=()=>window.dispatchEvent(new CustomEvent('investment-notification-read',{detail:{id:item.id}}));list.append(row);}
    if(watchlist.length&&!alerts.length)list.append(element('p','새로 확인된 알림이 없습니다.','lounge-meta'));
  }

  function draw(){
    for(const button of document.querySelectorAll('[data-lounge-market]'))button.setAttribute('aria-pressed',String(button.dataset.loungeMarket===market));
    renderTape();renderState();renderSignals();renderCalendar();renderNews();renderWatch();
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
  for(const button of document.querySelectorAll('[data-lounge-market]'))button.onclick=()=>{market=button.dataset.loungeMarket;try{localStorage.setItem('lounge-market-v1',market);}catch{}draw();};
  for(const button of document.querySelectorAll('[data-lounge-state]'))button.onclick=()=>{view=button.dataset.loungeState;renderSignals();};
  $('lounge-type').onchange=()=>{renderSignals();renderState();};
  $('lounge-open-alerts').onclick=event=>{event.stopPropagation();document.getElementById('notification-button')?.click();};
  $('lounge-refresh').onclick=()=>Promise.all([loadStored(),loadLive()]);
  window.addEventListener('storage',event=>{if(event.key===WATCH_KEY)syncWatchlist();if(event.key===NOTIFICATION_KEY)renderWatch();});
  window.addEventListener('investment-watchlist-change',syncWatchlist);window.addEventListener('investment-notifications-change',renderWatch);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadLive();});
  syncWatchlist();draw();setInterval(()=>{if(!document.hidden)loadLive();},30000);setInterval(()=>{if(!document.hidden)loadStored();},300000);
  await Promise.all([loadStored(),loadLive()]);
}
