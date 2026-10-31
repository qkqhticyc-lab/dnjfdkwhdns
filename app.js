import {initAuth} from './auth.js';
import {initMarket} from './market.js';
import {initResearch} from './research.js';
import {initCommunity} from './community.js';
if(location.hash==='#reading')location.replace('./reports.html');
if(location.hash==='#community')location.replace('./community.html');
fetch('./site.config.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(async config=>{
 document.querySelectorAll('[data-title]').forEach(n=>n.textContent=config.title||'부자가 되어보자...');
 const page=document.body.dataset.page;
 const community=page==='community'?initCommunity(config):null;
 await initAuth(config,community?.onSession);
 if(page==='market')await initMarket(config);
 if(page==='reports')await initResearch();
}).catch(()=>{const box=document.createElement('p');box.className='member-status is-error';box.textContent='서비스 연결을 확인하지 못했습니다. 잠시 후 새로고침해 주세요.';document.querySelector('main').prepend(box);});
