import { initMembers } from './members.js';
import { initResearch } from './research.js';
initResearch();
const allowedSymbols=new Set(['FOREXCOM:NSXUSD','FOREXCOM:SPXUSD','KRX:KOSPI','KRX:KOSDAQ','FX_IDC:USDKRW']);
function widget(id,kind,config){
  const host=document.getElementById(id);host.replaceChildren();
  const frame=document.createElement('iframe');frame.title=id==='chart'?'TradingView 시장 차트':'TradingView 시장 시세';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  frame.referrerPolicy='no-referrer';
  frame.src='https://www.tradingview-widget.com/embed-widget/'+kind+'/?locale=kr#'+encodeURIComponent(JSON.stringify(config));
  const credit=document.createElement('div');credit.className='tradingview-widget-copyright';
  const link=document.createElement('a');link.href='https://www.tradingview.com/';link.target='_blank';link.rel='noopener nofollow';link.textContent='Track markets on TradingView';credit.append(link);
  host.append(frame,credit);
}
function chart(symbol){
  if(!allowedSymbols.has(symbol))return;
  if(symbol.startsWith('KRX:')){
    const host=document.getElementById('chart'),notice=document.createElement('div');notice.className='chart-unavailable';
    const title=document.createElement('h3');title.textContent=symbol.endsWith('KOSPI')?'코스피 지수':'코스닥 지수';
    const text=document.createElement('p');text.textContent='이 지수는 현재 외부 차트에서 제공되지 않습니다. 네이버페이 증권에서 현재 지수를 확인하세요.';
    const link=document.createElement('a');link.className='button';link.textContent='국내 지수 확인하기 ↗';link.href='https://finance.naver.com/sise/sise_index.naver?code='+symbol.split(':')[1];link.target='_blank';link.rel='noopener';notice.append(title,text,link);host.replaceChildren(notice);
    const fallback=document.getElementById('chart-fallback');fallback.href=link.href;fallback.textContent='네이버페이 증권에서 지수 확인 ↗';return;
  }
  document.getElementById('chart-fallback').textContent='TradingView에서 차트 열기 ↗';  widget('chart','advanced-chart',{autosize:true,symbol,interval:'D',timezone:'Asia/Seoul',theme:'light',style:'1',locale:'kr',allow_symbol_change:true,calendar:false,hide_side_toolbar:true,support_host:'https://www.tradingview.com'});
  document.getElementById('chart-fallback').href='https://www.tradingview.com/symbols/'+symbol.replace(':','-')+'/';
}
document.getElementById('date').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'full'}).format(new Date());
document.getElementById('market-select').addEventListener('change',event=>{document.getElementById('chart-heading').textContent=event.target.selectedOptions[0].textContent;chart(event.target.value);});
widget('ticker','ticker-tape',{symbols:[{proName:'FOREXCOM:SPXUSD',title:'S&P 500 CFD'},{proName:'FOREXCOM:NSXUSD',title:'나스닥100 CFD'},{proName:'FX_IDC:USDKRW',title:'원·달러'}],showSymbolLogo:true,colorTheme:'light',isTransparent:true,displayMode:'adaptive',locale:'kr'});
chart('FOREXCOM:NSXUSD');
fetch('./site.config.json').then(r=>{if(!r.ok)throw Error('config unavailable');return r.json();}).then(async config=>{
  if(config.title){document.title=config.title;document.querySelectorAll('[data-title]').forEach(el=>el.textContent=config.title);}
  if(config.description)document.querySelector('[data-description]').textContent=config.description;
  if(config.privateJournalUrl){const url=new URL(config.privateJournalUrl);if(url.protocol==='https:')document.querySelectorAll('[data-private]').forEach(el=>el.href=url.href);}
  await initMembers(config);
}).catch(()=>{const status=document.getElementById('member-status');status.hidden=false;status.textContent='연결 설정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';status.classList.add('is-error');});
