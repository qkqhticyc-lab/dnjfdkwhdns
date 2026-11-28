import{initScreenerV2}from'./screener-v2-ui.js';
import{initEnhancedStudy}from'./enhanced-study.js';
import{initScreenWatchlist}from'./watchlist-ui.js';
import {entryLocation, matchesLocation} from './screener-location.mjs';
import {rankScreenItem} from './screener-rank.mjs';
import {screenMarketDates,screenMarketDateText} from './screener-freshness.mjs';
import {screenerReferences,screenRefreshText} from './scan-watchdog-core.mjs';
import{SECTORS,sectorMatch}from'./sector-core.mjs';
import{ENTRY_LABELS,screenEntryType}from'./entry-types.mjs';
import{formatPrice,formatTarget}from'./price-display.mjs';
import{filterScreen}from'./screener-core.mjs';
import{CANDIDATE_RULE}from'./rebound-candidate-core.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;},num=v=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:2}):'—';

const normalHeaders=['종목 · 섹터/업종','지금 자리 · 우선순위','마감가 · 기준일','등락률','추세','RSI','거래량','최근 진입 · 상태','진입가','TP1','TP2','20봉 평균 거래대금','제외'];
const candidateHeaders=['종목 · 섹터/업종','분석 기준일','마감 가격','등락률','추세','현재 RSI','거래량','관찰 시작 · 경과','관찰 가격대','현재 / 시작 낙폭','미충족 조건','20봉 평균 거래대금','제외','후보 상태'];
const stockLink=p=>{const a=el('a',p.name+' · '+p.symbol);a.href='./charts.html?'+new URLSearchParams({market:p.market,symbol:p.symbol,name:p.name,currency:p.currency,exchange:p.exchange});if(!/^[A-Z0-9.-]{1,20}$/.test(p.symbol)){a.href='https://stock.naver.com/worldstock/stock/'+encodeURIComponent(p.providerSymbol)+'/price';a.target='_blank';a.rel='noopener noreferrer';a.textContent+=' · 원자료 ↗';}return a;};
const candidateConditions=c=>{const d=el('details');d.className='screen-candidate-conditions';d.append(el('summary','확인 대기 '+c.blocked.length+'개 조건'));const list=el('ul');for(const text of c.blocked)list.append(el('li',text));d.append(list);return d;};
const candidateStatus=c=>c.newLow?'저점 갱신 중 · 확인 전':'관찰 중 · 확인 전';
const turnover=p=>{const units={KR:[1e8,'억 원'],US:[1e6,'백만 달러'],JP:[1e8,'억 엔']},unit=units[p.market];return Number.isFinite(p.liquidity?.average)&&unit?num(p.liquidity.average/unit[0])+' '+unit[1]:'20봉 집계 대기';};

function priorityCell(rank) {
 const cell = el('td');
 cell.className = 'screen-priority-cell';
 if (!rank) { cell.textContent = '—'; return cell; }
 const details = el('details');
 const summary = el('summary', rank.score + ' / 100');
 summary.setAttribute('aria-label', '우선순위 ' + rank.score + '점 근거');
 details.append(summary);
 const reasons = el('ul');
 for (const component of rank.components) reasons.append(el('li', component.label + ' ' + component.points + '/' + component.max + ' · ' + component.detail));
 details.append(reasons);
 cell.append(details);
 return cell;
}
function locationCell(item) {
 const cell=el('td'), location=item.location, details=el('details'), summary=el('summary',location.label);
 cell.className='screen-location-cell';summary.className='screen-location-badge location-'+location.code;details.append(summary);
 const reason=el('p',location.reason);details.append(reason);
 if(Number.isFinite(location.gapPct))details.append(el('p','진입가 대비 '+(location.gapPct>=0?'+':'')+num(location.gapPct)+'% · '+num(location.gapAtr)+'ATR'));
 if(Number.isFinite(location.support))details.append(el('p',location.supportLabel+' '+formatPrice(location.support,item.currency)+' '+item.currency));
 if(Number.isFinite(location.stop))details.append(el('p','추적 손절선 '+formatPrice(location.stop,item.currency)+' '+item.currency));
 if(location.targetBeforeExit)details.append(el('p','목표 도달 이력이 있지만 이후 신호가 종료되었습니다.'));
 details.append(el('p','분석 기준 '+item.asOf));cell.append(details);return cell;
}
export async function initScreener(config={}){let data,sectorData,earningsData,freshness,shown=50,excluded=[],candidateMode=false,savedEntryFilters=null;try{excluded=JSON.parse(localStorage.getItem('screen-excluded-v1')||'[]');if(!Array.isArray(excluded))excluded=[];}catch{};const $=id=>document.getElementById(id),controls=['screen-location','screen-min-score','screen-max-gap','screen-turnover-KR','screen-turnover-US','screen-turnover-JP','screen-sector','screen-industry','screen-entry-type','screen-market','screen-query','screen-age','screen-state','screen-trend','screen-volume','screen-sort'];
 const watchHost=document.createElement('div');watchHost.id='screen-watch-tools';$('screen-excluded').before(watchHost);const watchActions=initScreenWatchlist(watchHost);
 const v2=initScreenerV2({before:$('screen-filter-anchor'),config,onChange:()=>{shown=50;draw();}});initEnhancedStudy({settings:()=>v2.settings()});
 for(const[id,label]of Object.entries(SECTORS)){const o=el('option',label);o.value=id;$('screen-sector').append(o);}
 function syncIndustries(){if(!data)return;const select=$('screen-industry'),value=select.value,market=$('screen-market').value,sector=$('screen-sector').value,names=[...new Set(data.items.filter(p=>(market==='ALL'||p.market===market)&&sectorMatch(p,sector)).map(p=>p.sector?.industry).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));select.replaceChildren();const all=el('option','전체 업종');all.value='ALL';select.append(all);for(const name of names){const o=el('option',name);o.value=name;select.append(o);}select.value=names.includes(value)?value:'ALL';}
 $('screen-sector').addEventListener('input',()=>{$('screen-industry').value='ALL';syncIndustries();});$('screen-market').addEventListener('input',()=>{$('screen-industry').value='ALL';syncIndustries();});
 function draw(){if(!data)return;const latestDates={};for(const p of data.items)if(p.status==='ok'&&p.asOf>(latestDates[p.market]||''))latestDates[p.market]=p.asOf;for(const m of data.marketDates||[])if(m.reference>(latestDates[m.market]||''))latestDates[m.market]=m.reference;const mode=$('screen-entry-type').value==='reboundCandidate',reference=p=>mode?p.candidate:p.signal;document.body.classList.toggle('screen-candidate-mode',mode);$('screen-candidate-note').hidden=!mode;$('screen-candidate-note').textContent='지지 재시험·매도 거래량 감소·저점 방어·저항까지 1.5R을 확인한 후보입니다. 회복 봉과 매수 거래량 확인은 아직 남아 있습니다. '+CANDIDATE_RULE+' 지지 하단을 종가로 이탈하면 후보에서 제외합니다.';const enhanced=v2.enabled($('screen-market').value,mode);document.body.classList.toggle('screen-enhanced-mode',enhanced);const tableHeaders=mode?candidateHeaders:enhanced?v2.headers:normalHeaders;$('screen-table-head').replaceChildren(...tableHeaders.map(t=>{const th=el('th',t);th.scope='col';return th;}));const searchOptions={entryType:$('screen-entry-type').value,excludeSpecial:true,excluded,market:$('screen-market').value,query:$('screen-query').value.trim(),age:$('screen-age').value,state:$('screen-state').value,trend:$('screen-trend').value};let rows=filterScreen(data.items.filter(p=>(!mode||data.candidateRulesVersion===2)&&sectorMatch(p,$('screen-sector').value,$('screen-industry').value)),searchOptions);const rankFilters={minScore:mode?0:+$('screen-min-score').value,maxGap:mode?0:+$('screen-max-gap').value,turnoverLimits:{KR:+$('screen-turnover-KR').value*1e8,US:+$('screen-turnover-US').value*1e6,JP:+$('screen-turnover-JP').value*1e8}};rows=rows.map(p=>({...p,priority:mode?null:rankScreenItem(p),location:entryLocation(p,{latestDate:latestDates[p.market]})}));
  rows=v2.apply(rows,latestDates,{rankFilters});
  const locationChoice=$('screen-location').value;
  quickRows.get('screen-location').hidden=mode;$('screen-location-help').hidden=mode;
  const counts={all:rows.length,nearby:0};for(const row of rows){counts[row.location.code]=(counts[row.location.code]||0)+1;if(matchesLocation(row.location,'nearby'))counts.nearby++;}
  for(const button of quickRows.get('screen-location').querySelectorAll('button')){const value=button.dataset.value;button.textContent=button.dataset.label+' '+(counts[value]||0);}
  if(!mode)rows=rows.filter(p=>matchesLocation(p.location,locationChoice));
  const selectedLabel=id=>$(id).selectedOptions[0].textContent;v2.report({totalCount:data.items.filter(p=>searchOptions.market==='ALL'||p.market===searchOptions.market).length,baseSummary:['screen-market','screen-age','screen-entry-type','screen-state','screen-sector','screen-industry','screen-trend'].map(selectedLabel).join(' · ')+(searchOptions.query?' · 검색어 '+searchOptions.query:''),locationChoice,finalRows:rows,rankFilters,excludedCount:excluded.length});
  $('screen-location-basis').textContent='최근 수집된 마감 일봉 기준 · 실시간 가격 아님 · '+(locationChoice==='all'?'자리별 분류를 눌러 좁혀보세요.':'기간·유동성·업종 등 다른 조건도 함께 적용됩니다.');
  $('screen-location-basis').hidden=mode;$('screen-min-score').disabled=mode;$('screen-max-gap').disabled=mode;const sort=$('screen-sort').value;rows.sort((a,b)=>sort==='priority'&&!mode?(b.priority?.score??-1)-(a.priority?.score??-1)||(reference(a)?.age??9999)-(reference(b)?.age??9999):sort==='volume'?(b.volumeRatio??-1)-(a.volumeRatio??-1):['average','median'].includes(sort)?(b.liquidity?.[sort]??-1)-(a.liquidity?.[sort]??-1):sort==='rsi'?(b.rsi??-1)-(a.rsi??-1):sort==='change'?b.changePercent-a.changePercent:(reference(a)?.age??9999)-(reference(b)?.age??9999)||b.asOf.localeCompare(a.asOf));
  $('screen-excluded').textContent='직접 제외 '+excluded.length+'종목 · 이 브라우저에 저장';$('screen-count').textContent=`정상 분석 ${data.items.filter(p=>p.status==='ok').length} / 대상 ${data.items.length}종목 · 필터 결과 ${rows.length}종목`;const body=$('screen-body');body.replaceChildren();
  const cards=$('screen-candidate-cards');cards.replaceChildren();
  const exclude=p=>{excluded=[...new Set([...excluded,p.market+':'+p.symbol])];try{localStorage.setItem('screen-excluded-v1',JSON.stringify(excluded));}catch{}draw();};
  for(const p of rows.slice(0,shown)){
   if(enhanced){body.append(v2.row(p,watchActions,exclude));continue;}
   const c=p.candidate,tr=el('tr'),name=el('td'),pick=el('div'),link=stockLink(p),market=el('span',p.market),meta=el('small',p.exchange+' · '+(SECTORS[p.sector?.id]||SECTORS.unknown)+(p.sector?.industry?' · '+p.sector.industry:''));pick.className='screen-stock-pick';link.title=link.textContent;market.className='screen-market-tag';market.title=({KR:'한국',US:'미국',JP:'일본'})[p.market]||p.market;meta.title=meta.textContent;pick.append(watchActions.button(p),link,market);name.append(pick,meta);tr.append(name);
   const values=mode?[p.asOf,formatPrice(p.price,p.currency)+' '+p.currency,(p.changePercent>0?'+':'')+num(p.changePercent)+'%',({up:'상승',down:'하락',mixed:'혼조',insufficient:'자료 부족'})[p.trend],num(p.rsi),num(p.volumeRatio)+'배',c.asOf+' · '+c.age+'봉 전',formatPrice(c.lower,p.currency)+' ~ '+formatPrice(c.upper,p.currency),'현재 -'+num(c.currentDropPct)+'% / 시작 -'+num(c.initialDropPct)+'%',null,turnover(p),null,candidateStatus(c)]:[p.asOf,formatPrice(p.price,p.currency)+' '+p.currency,(p.changePercent>0?'+':'')+num(p.changePercent)+'%',({up:'상승',down:'하락',mixed:'혼조',insufficient:'자료 부족'})[p.trend],num(p.rsi),num(p.volumeRatio)+'배',p.signal?p.signal.asOf+' · '+p.signal.age+'봉 전 · '+ENTRY_LABELS[screenEntryType(p.signal)]:'—',p.signal?formatPrice(p.signal.entry,p.currency):'—',p.signal?formatTarget(p.signal.tp1,p.currency):'—',p.signal?formatTarget(p.signal.tp2,p.currency):'—',turnover(p),null,({active:'진입 후 추적',closed:'종료',setup:'셋업',none:'관찰'})[p.state]];
   for(const value of values)tr.append(el('td',value));if(mode){tr.dataset.reboundCandidate='true';tr.children[10].append(candidateConditions(c));}const hide=el('button','제외');hide.onclick=()=>exclude(p);tr.children[12].append(hide);tr.children[3].className=p.changePercent>=0?'up':'down';if(!mode){tr.insertBefore(priorityCell(p.priority),tr.children[1]);tr.insertBefore(locationCell(p),tr.children[1]);tr.dataset.location=p.location.code;
    // Put related metadata in the same column, retaining all prices and actions.
    const cells=[...tr.children],priority=cells[2].firstElementChild;
    if(priority){priority.className='screen-priority-details';cells[1].append(priority);}
    cells[4].append(el('small',p.asOf));cells[4].title='분석 기준일 '+p.asOf;
    cells[9].replaceChildren();if(p.signal){cells[9].append(el('span',p.signal.asOf+' · '+p.signal.age+'봉 전'),el('small',ENTRY_LABELS[screenEntryType(p.signal)]+' · '+(({active:'추적',closed:'종료',setup:'셋업',none:'관찰'})[p.state]||cells[15].textContent)));}else cells[9].append(el('span','—'),el('small',cells[15].textContent));
    cells[2].remove();cells[3].remove();cells[15].remove();v2.legacyDetails(p,cells[1].querySelector('.screen-priority-details ul'),cells[1]);
   }body.append(tr);
   if(mode){const card=el('article');card.className='panel screen-candidate-card';card.dataset.candidateSymbol=p.market+':'+p.symbol;const head=el('div');head.className='screen-candidate-card-head';head.append(watchActions.button(p),stockLink(p),el('span',candidateStatus(c)));card.append(head,el('small',p.market+' · '+(SECTORS[p.sector?.id]||SECTORS.unknown)+(p.sector?.industry?' · '+p.sector.industry:'')),el('p','마감 '+formatPrice(p.price,p.currency)+' '+p.currency+' · RSI '+num(p.rsi)+' · 거래량 '+num(p.volumeRatio)+'배'),el('p','관찰 가격대 '+formatPrice(c.lower,p.currency)+' ~ '+formatPrice(c.upper,p.currency)+' '+p.currency),el('p','현재 낙폭 -'+num(c.currentDropPct)+'% · 시작 시 -'+num(c.initialDropPct)+'%'),el('small','관찰 시작 '+c.asOf+' · '+c.age+'봉 경과 · '+(c.expiresIn?'최대 '+c.expiresIn+'봉 더 관찰':'이번 봉까지 관찰')),candidateConditions(c),el('small','20봉 평균 거래대금 '+turnover(p)+' · 자료 '+p.asOf));const remove=el('button','이 종목 제외');remove.onclick=()=>exclude(p);card.append(remove);cards.append(card);}
  }
  if(mode&&!rows.length)cards.append(el('p',data.candidateRulesVersion===2?'현재 조건에 맞는 반등 전 후보가 없습니다. 기간·거래대금 조건을 확인하세요.':'지지 반등 후보 전체 검사를 진행 중입니다.','screen-info'));
  $('screen-empty').hidden=rows.length>0;$('screen-more').hidden=shown>=rows.length;
  const classified=data.items.filter(p=>p.sector?.id&&p.sector.id!=='unknown').length,stale=data.items.filter(p=>p.sector?.status==='stale').length;$('screen-sector-status').textContent=sectorData?'업종 분류 '+classified.toLocaleString()+' / '+data.items.length.toLocaleString()+'종목 · 미분류 '+(data.items.length-classified).toLocaleString()+'종목'+(stale?' · 이전 분류 유지 '+stale+'종목':'')+' · 분류 조회 '+new Date(sectorData.collectedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'업종 분류 자료 연결 지연 · 전체 검색은 계속 사용할 수 있습니다.';
  $('screen-updated').textContent='검사 시작 '+new Date(data.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST'+(data.completedAt?' · 완료 '+new Date(data.completedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'')+' · 진행 봉 제외';
  let marketDates=$('screen-market-updated');if(!marketDates){marketDates=el('p',null,'screen-info');marketDates.id='screen-market-updated';$('screen-updated').after(marketDates);}
  const references=screenerReferences(data.marketDates,freshness),dates=screenMarketDates(data.items,references);marketDates.textContent='시장별 최근 분석일 · '+screenMarketDateText(dates);
  let refreshState=$('screen-refresh-state');if(!refreshState){refreshState=el('p',null,'screen-info');refreshState.id='screen-refresh-state';refreshState.setAttribute('role','status');marketDates.after(refreshState);}refreshState.textContent=screenRefreshText(dates,freshness,data.refresh);refreshState.hidden=!refreshState.textContent;
  let schedule=$('screen-schedule');if(!schedule){schedule=el('p',null,'screen-info');schedule.id='screen-schedule';marketDates.after(schedule);}schedule.textContent='장 마감 후 확정 일봉을 검사합니다. 제공처 갱신·전체 종목 검사·게시 시간이 추가되며 진행 봉은 제외합니다.'+(freshness?.checkedAt?' 최근 마감 자료 확인 '+new Date(freshness.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST.':'');
  $('screen-coverage').textContent=(data.universeScope==='all-provider-listed'?'전체 목록 수집: ':'전체 목록 첫 검사 준비 중 · 이전 제한 목록: ')+data.coverage.map(g=>g.label+' '+g.requested.toLocaleString()+'개'+(g.status!=='ok'?' (목록 수집 지연)':'')).join(' / ');
  const failures=data.items.filter(p=>p.status!=='ok').length,late=Date.now()-Date.parse(data.collectedAt)>30*3600000;$('screen-warning').textContent=(late?'수집이 30시간 이상 지연되었습니다. ':'')+(failures?failures+'종목은 조회 지연·자료 부족으로 결과에서 제외했습니다. ':'')+(data.candidateRulesVersion!==2?'지지 반등 후보 전체 재검사 중입니다. 후보 검색은 완료 후 반영됩니다. ':'')+(data.bounceRulesVersion!==1?'과매도 반등 전체 재검사 중입니다. 해당 유형은 검사 완료 후 반영됩니다. ':'')+(data.patternRulesVersion!==1?'새 패턴 전체 재검사 중입니다. 삼각수렴·박스권 검색 결과는 완료 후 반영됩니다. ':'')+(data.items.some(p=>p.signal&&!p.signal.entryType)?'눌림·회복 유형 재집계 중입니다. 미분류 기록은 전체 유형에서 확인하세요. ':'')+(data.coverage.some(p=>p.status==='stale')?'일부 거래소는 이전 종목 목록으로 시세를 다시 분석했습니다. 신규 상장은 다음 목록 갱신에 반영됩니다. ':'')+(data.coverage.some(p=>p.status==='unavailable')?'일부 거래소 목록 조회 실패. ':'');
 }
 async function load(){try{$('screen-refresh').disabled=true;const earningsPromise=fetch('./data/earnings.json',{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.json():null).catch(()=>null);const sectorPromise=fetch('./data/sectors.json',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(d.schemaVersion!==1||!Array.isArray(d.items))throw Error();return d;}).catch(()=>null);const r=await fetch('./data/screener.json',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(d.schemaVersion!==1||d.rulesVersion!=='independent-v3'||!Array.isArray(d.items))throw Error();if(!data||d.collectedAt>=data.collectedAt)data=d;const [next,newEarnings]=await Promise.all([sectorPromise,earningsPromise]);if(newEarnings?.schemaVersion===1)earningsData=newEarnings;if(next?.collectedAt&&(!sectorData||next.collectedAt>=sectorData.collectedAt))sectorData=next;const sectors=new Map((sectorData?.items||[]).map(p=>[p.key,p]));data.items=data.items.map(p=>({...p,sector:sectors.get(p.market+':'+p.symbol)||{id:'unknown',industry:null}}));v2.update(data,sectorData,earningsData);syncIndustries();draw();}catch{$('screen-warning').textContent='검색 자료를 불러오지 못했습니다. 이전 결과가 있으면 그대로 유지합니다.';}finally{$('screen-refresh').disabled=false;}}
 const quickRows=new Map();
 for (const id of ['screen-market', 'screen-age', 'screen-state', 'screen-entry-type', 'screen-location']) {
  const select = $(id), group = el('div');
  group.className = 'screen-chip-row';
  if(id==='screen-location')group.classList.add('screen-location-options');
  group.append(el('span', select.parentElement.firstChild.textContent));
  let options = group, rebound;
  if (id === 'screen-entry-type') {
   group.classList.add('screen-entry-types');
   options = el('div');
   options.className = 'screen-entry-options';
   const main = el('div');
   main.className = 'screen-entry-row';
   main.setAttribute('role','group');
   main.setAttribute('aria-label','추세·패턴 검색 유형');
   rebound = el('div');
   rebound.className = 'screen-entry-row screen-rebound-row';
   rebound.setAttribute('role','group');
   rebound.setAttribute('aria-label','반등 검색 유형');
   options.append(main, rebound);
   group.append(options);
   options = main;
  }
  for (const option of select.options) {
   const button = el('button', option.textContent);
   button.type = 'button';
   button.dataset.value = option.value;
   button.dataset.label = option.textContent;
   button.setAttribute('aria-pressed', String(select.value === option.value));
   button.onclick = () => { select.value = option.value; select.dispatchEvent(new Event('input')); };
   const isRebound = ['reboundCandidate', 'supportBounce', 'oversoldBounce'].includes(option.value);
   (isRebound && rebound ? rebound : options).append(button);
  }
  select.addEventListener('input', () => {
   for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.value === select.value));
  });
  $('screen-quick').append(group);
  quickRows.set(id, group);
  select.parentElement.classList.add('screen-quick-select');
 }
 $('screen-entry-type').addEventListener('input',()=>{const next=$('screen-entry-type').value==='reboundCandidate';if(next&&!candidateMode){savedEntryFilters={age:$('screen-age').value,state:$('screen-state').value};$('screen-age').value='all';$('screen-state').value='all';}else if(!next&&candidateMode&&savedEntryFilters){$('screen-age').value=savedEntryFilters.age;$('screen-state').value=savedEntryFilters.state;}candidateMode=next;$('screen-sort').options[0].textContent=next?'최근 관찰 시작순':'우선순위 높은순';$('screen-sort').querySelector('[value=signal]').textContent=next?'최근 관찰 시작순':'최근 신호순';$('screen-age').querySelector('[value=all]').textContent=next?'현재 후보 전체':'전체 이력';quickRows.get('screen-age').querySelector('[data-value=all]').textContent=next?'현재 후보 전체':'전체 이력';quickRows.get('screen-state').hidden=next;quickRows.get('screen-age').querySelector('span').textContent=next?'관찰 시작':'최근 진입 신호';for(const id of ['screen-age','screen-state'])for(const b of quickRows.get(id).querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.value===$(id).value));const u=new URL(location.href);if(next)u.searchParams.set('view','rebound');else u.searchParams.delete('view');history.replaceState(null,'',u);});
 $('screen-location').addEventListener('input',()=>{if($('screen-location').value!=='all'){$('screen-state').value='all';for(const b of quickRows.get('screen-state').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.value==='all'));}});
 $('screen-reset-excluded').onclick=()=>{excluded=[];try{localStorage.removeItem('screen-excluded-v1');}catch{}draw();};
 let checking;
 async function checkFreshness(){if(!config.supabase?.url||checking)return;checking=true;try{const r=await fetch(config.supabase.url+'/functions/v1/screener-watchdog',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const next=await r.json();if(next.schemaVersion===1&&Array.isArray(next.dates)&&(!freshness||next.checkedAt>=freshness.checkedAt)){freshness=next;draw();}}catch{/* Keep observed dates; a failed check cannot claim that stale data is current. */}finally{checking=false;}}
 const refresh=()=>Promise.allSettled([load(),checkFreshness()]);
 controls.forEach(id=>$(id).addEventListener('input',()=>{shown=50;draw();}));$('screen-more').onclick=()=>{shown+=50;draw();};$('screen-refresh').onclick=refresh;if(new URLSearchParams(location.search).get('view')==='rebound'){$('screen-entry-type').value='reboundCandidate';$('screen-entry-type').dispatchEvent(new Event('input'));}const requestedMarket=new URLSearchParams(location.search).get('market');if(['KR','US','JP'].includes(requestedMarket)){$('screen-market').value=requestedMarket;$('screen-market').dispatchEvent(new Event('input'));}await refresh();setInterval(()=>{if(!document.hidden)load();},300000);setInterval(()=>{if(!document.hidden)checkFreshness();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
}
