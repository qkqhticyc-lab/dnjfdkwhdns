import{initScreener}from'./screener.js';
import {initClub} from './club.js';
import {initETFs} from './etfs.js';
import {initAuth} from './auth.js';
import {initMarket} from './market.js';
import {initResearch} from './research.js';
import {initCommunity} from './community.js';
import {initCredit} from './credit.js';
import {initPositionMonitor} from './position-monitor.js';
import {initIndicators} from './indicators.js';
import {initCharts} from './charts.js';
import {initNavigation} from './navigation.js';
import {initSentiment} from './sentiment.js';
if(location.hash==='#reading')location.replace('./reports.html');
if(location.hash==='#community')location.replace('./community.html');
fetch('./site.config.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(async config=>{
 document.querySelectorAll('[data-title]').forEach(n=>n.textContent=config.title||'부자가 되어보자...');
 initNavigation(config);
 const page=document.body.dataset.page;
 const community=page==='community'?initCommunity(config):null;
 // Public market data starts independently of account/session initialization.
 const club=page==='club'?initClub(config):null;
 const market=page==='market'?Promise.all([initMarket(config),initIndicators(config),initSentiment()]):null;
 await initAuth(config,community?.onSession);
 if(market)await market;
 if(club)await club;
 if(page==='reports')await initResearch();
 if(page==='credit'){initPositionMonitor();await initCredit();}
 if(page==='charts')await initCharts(config);
 if(page==='screener')await initScreener();
 if(page==='etfs')await initETFs();
}).catch(()=>{const box=document.createElement('p');box.className='member-status is-error';box.textContent='서비스 연결을 확인하지 못했습니다. 잠시 후 새로고침해 주세요.';document.querySelector('main').prepend(box);});
