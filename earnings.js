import {EARNINGS_METRICS, EARNINGS_THRESHOLD, surprise, earningsVerdict, earningsDecision, validEarnings} from './earnings-core.mjs';

const el = (tag, text, className) => {
 const node=document.createElement(tag);
 if (text!==null && text!==undefined) node.textContent=text;
 if (className) node.className=className;
 return node;
};
const amount = value => Number.isFinite(value) ? value.toLocaleString('ko-KR',{maximumFractionDigits:Math.abs(value)<10?1:0}) : '—';
const percent = value => Number.isFinite(value) ? (value>0?'+':'')+value.toFixed(1)+'%' : '—';
const quarter = period => period.replace('/', '년 ')+'분기';

function sourceLink(url, text) {
 const link=el('a',text);
 try {
  const parsed=new URL(url);
  if (parsed.protocol!=='https:' || !['comp.wisereport.co.kr','m.stock.naver.com'].includes(parsed.hostname)) return el('span',text);
  link.href=parsed.href;link.target='_blank';link.rel='noopener noreferrer';return link;
 } catch { return el('span',text); }
}

function card(item, now) {
 const article=el('article',null,'earnings-card panel');
 article.dataset.earningsSymbol=item.symbol;
 const verdict=earningsVerdict(item), decision=earningsDecision(item,now);
 const header=el('div',null,'earnings-card-heading'), identity=el('div'), heading=el('h3'), chartLink=el('a',item.name);
 chartLink.href='./charts.html?'+new URLSearchParams({market:'KR',symbol:item.symbol,name:item.name,currency:'KRW'});
 heading.append(chartLink,el('small','A'+item.symbol));
 identity.append(heading,el('p',quarter(item.period)+' · '+(item.basis==='consolidated'?'연결':'별도')+' · 발표 '+item.announcedOn));
 header.append(identity,el('span',verdict.label,'earnings-verdict earnings-'+verdict.kind));
 article.append(header);
 if (item.marketCap) article.append(el('p','시총 '+item.marketCap+'원 · '+String(item.companyFetchedAt).slice(0,10)+' 조회 기준','earnings-meta'));
 article.append(el('p',item.reportTitle,'earnings-report-title'));
 const metrics=el('table',null,'earnings-metrics');
 const caption=el('caption','단위 억원 · 예상은 FnGuide 발표직전 컨센서스');metrics.append(caption);
 const head=el('thead'), headRow=el('tr');
 for (const label of ['항목','발표','예상','예상 대비']) headRow.append(el('th',label));
 head.append(headRow);metrics.append(head);
 const body=el('tbody');
 for (const metric of EARNINGS_METRICS) {
  const data=item.metrics[metric.key]||{}, comparison=surprise(data.actual,data.forecast);
  const row=el('tr'), label=el('th',metric.label);
  if(metric.key==='net'&&item.basis==='consolidated')label.append(el('small','지배주주','earnings-net-basis'));
  label.scope='row';
  const actual=el('td',amount(data.actual),'earnings-actual'), forecast=el('td',amount(data.forecast));
  const change=el('td',null,'earnings-comparison earnings-'+comparison.kind);
  const tag=comparison.percent>=EARNINGS_THRESHOLD?'서프라이즈':comparison.percent<=-EARNINGS_THRESHOLD?'쇼크':comparison.label;
  change.append(el('strong',percent(comparison.percent)),el('small',tag));
  row.append(label,actual,forecast,change);body.append(row);
 }
 metrics.append(body);article.append(metrics);
 const history=el('table',null,'earnings-history');
 history.append(el('caption','최근 분기 실적 · 단위 억원'+(item.basis==='consolidated'?' · 지배주주 순익':'')));
 const historyHead=el('thead'), labels=el('tr');
 for (const label of ['분기','매출액','영업이익','순이익']) labels.append(el('th',label));
 historyHead.append(labels);history.append(historyHead);
 const historyBody=el('tbody');
 for (const point of item.history||[]) {
  const row=el('tr'), label=el('th',point.period.replace('/','.')+'Q');
  label.scope='row';label.title=point.source||'';row.append(label);
  for (const metric of EARNINGS_METRICS) row.append(el('td',amount(point.metrics?.[metric.key]?.actual)));
  historyBody.append(row);
 }
 history.append(historyBody);article.append(history);
 const recommendation=el('div',null,'earnings-decision earnings-decision-'+decision.kind);
 recommendation.append(el('strong',decision.label));
 const reasons=el('ul');for(const reason of decision.reasons) reasons.append(el('li',reason));recommendation.append(reasons);
 if (item.chart?.status==='ok') recommendation.append(el('small',`차트 ${item.chart.asOf} 마감 · ${amount(item.chart.price)}원`));
 const open=el('a','차트에서 진입가·TP 확인 ↗');open.href=chartLink.href;recommendation.append(open);article.append(recommendation);
 const sources=el('div',null,'earnings-card-sources');sources.append(sourceLink(item.sourceUrl,'실적·예상치 원자료 ↗'));
 if (item.disclosureUrl) sources.append(sourceLink(item.disclosureUrl,'공시 원문 ↗'));
 article.append(sources);
 if (item.stale) article.append(el('p','새 자료 연결 지연 · 이전 확인 자료','earnings-stale'));
 return article;
}

export function initEarningsCards() {
 const host=el('section',null,'earnings-section');host.id='earnings-announcements';host.hidden=true;
 const heading=el('h3','실적 발표와 매수 검토'), status=el('p','실적 수치를 불러오고 있습니다.','earnings-status');status.setAttribute('role','status');
 const controls=el('div',null,'earnings-controls');
 const searchLabel=el('label','종목 검색'), query=el('input');query.type='search';query.placeholder='삼양식품 · 003230';query.id='earnings-query';searchLabel.append(query);
 const filterLabel=el('label','실적·매수 조건'), filter=el('select');filter.id='earnings-filter';
 for(const [value,label] of [['all','전체'],['buy','매수 검토'],['surprise','어닝 서프라이즈'],['shock','어닝 쇼크'],['mixed','실적 혼재']]){const option=el('option',label);option.value=value;filter.append(option);}filterLabel.append(filter);
 const orderLabel=el('label','정렬'), order=el('select');order.id='earnings-order';
 for(const [value,label] of [['date','발표 최신순'],['surprise','영업익 상회율순'],['buy','매수 검토 먼저']]){const option=el('option',label);option.value=value;order.append(option);}orderLabel.append(order);controls.append(searchLabel,filterLabel,orderLabel);
 const list=el('div',null,'earnings-cards');list.id='earnings-cards';
 const more=el('button','실적 더 보기');more.id='earnings-more';more.type='button';more.hidden=true;
 const methods=el('details',null,'earnings-methods');methods.append(el('summary','서프라이즈·쇼크와 매수 검토 기준'));
 for(const text of [
  '국내 컨센서스 제공 종목 중 최근 60일 이내 발표한 최신 분기 실적을 수집합니다. 발표직전 예상치와 같은 분기·회계기준을 비교합니다.',
  '예상 대비 ±5%를 서프라이즈·쇼크 기준으로 사용합니다. 항목별 판정이 엇갈리면 실적 혼재입니다. 상회 빨강·하회 파랑·부합 검정으로 표시합니다. 적자 예상치는 절댓값으로 나누며 0 예상치는 비율을 계산하지 않습니다.',
  '연결 순이익은 지배주주 기준입니다. 최근 분기 표에는 제공된 잠정·확정 집계가 함께 들어가며, 출처별 집계·반올림·정정에 따라 공시와 차이가 생길 수 있습니다. 예상치가 없는 항목은 비교 자료 미제공으로 표시합니다.',
  '매수 검토는 영업이익 5% 이상 상회, 매출·순이익 예상치 충족과 흑자를 함께 확인합니다. 발표 다음 거래일부터 발생한 최근 5봉의 확정 돌파·눌림·삼각수렴·박스 재확인 신호, 우선순위 70점, 진입가 이격 ±5%, 단기·중기 정렬을 확인합니다. 발표 날짜만 확인된 자료에서는 같은 날 신호의 선후관계를 추정하지 않습니다.',
  '20봉 평균 거래대금 100억원·중앙값 50억원·거래 발생 15일, 현재 마감가 기준 초기 손절까지 8% 이내와 TP1 손익비 1.2 이상도 필요합니다. 스팩·양지사는 매수 검토에서 제외합니다.',
  '가격 판단은 최근 마감봉과 신호의 초기 손절·TP1을 사용하며 비용은 미반영입니다. 5일보다 오래된 차트 자료와 수집 지연 상태에서는 최신 자료 확인을 기다립니다. 우선순위 점수와 실적 판정은 규칙 기반 선별 결과입니다.',
  '실적 자료는 약 30분마다 수집하고 화면을 여는 동안 5분마다 새 배포 자료를 확인합니다. 회사별 발표일·과거 실적 보완 자료는 최대 6시간 캐시를 사용합니다.'
 ]) methods.append(el('p',text));
 const reviewHeading=el('h3','증권사 실적 리뷰','earnings-review-heading');
 host.append(heading,status,controls,list,more,methods,reviewHeading);
 document.querySelector('.research-banner').after(host);
 let data=null,limit=6,generation=0;
 function render() {
  if(!data)return;
  const now=Date.now(), term=query.value.trim().toLocaleLowerCase();
  let rows=data.items.filter(item=>(!term||(item.name+' '+item.symbol).toLocaleLowerCase().includes(term)) && (filter.value==='all'||(filter.value==='buy'?earningsDecision(item,now).kind==='buy':earningsVerdict(item).kind===filter.value)));
  rows.sort((a,b)=>{
   if(order.value==='buy'){const difference=Number(earningsDecision(b,now).kind==='buy')-Number(earningsDecision(a,now).kind==='buy');if(difference)return difference;}
   if(order.value==='surprise'){const aPercent=surprise(a.metrics.operating?.actual,a.metrics.operating?.forecast).percent??-Infinity,bPercent=surprise(b.metrics.operating?.actual,b.metrics.operating?.forecast).percent??-Infinity;if(aPercent!==bPercent)return bPercent-aPercent;}
   return b.announcedOn.localeCompare(a.announcedOn)||a.name.localeCompare(b.name,'ko');
  });
  list.replaceChildren();for(const item of rows.slice(0,limit))list.append(card(item,now));
  if(!rows.length)list.append(el('p',data.items.length?'조건에 맞는 실적 발표가 없습니다.':'확인된 실적 자료를 기다리고 있습니다.','research-empty'));
  more.hidden=rows.length<=limit;
  status.textContent=`국내 ${data.period?quarter(data.period)+' · ':''}${rows.length}종목 · ${data.coverage?.collected??data.items.length}/${data.coverage?.provided??data.items.length}종목 확인 · 수집 ${data.collectedAt?new Date(data.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'미확인'}${data.status==='ok'?'':' · 일부 자료 연결 지연'}`;
 }
 for(const control of [query,filter,order])control.addEventListener(control===query?'input':'change',()=>{limit=6;render();});
 more.onclick=()=>{limit+=6;render();};
 async function refresh() {
  const requestGeneration=++generation;
  try {
   const response=await fetch('./data/earnings.json',{cache:'no-store'});
   if(!response.ok)throw Error('Unavailable');
   const next=await response.json();if(requestGeneration!==generation)return;if(!validEarnings(next))throw Error('Invalid earnings');
   if(data?.collectedAt && (!next.collectedAt || next.collectedAt<data.collectedAt)) throw Error('Older earnings snapshot');
   data=next;render();
  } catch {
   if(requestGeneration!==generation)return;
   if(data){data={...data,status:'stale',items:data.items.map(item=>({...item,stale:true}))};render();}
   status.textContent=data?'새 자료 연결 지연 · 마지막 확인 실적을 표시합니다.':'실적 자료 연결이 지연되고 있습니다. 다시 불러오기를 눌러 주세요.';
  }
 }
 setInterval(()=>{if(!document.hidden)refresh();},300000);
 return {show(active){host.hidden=!active;},refresh};
}
