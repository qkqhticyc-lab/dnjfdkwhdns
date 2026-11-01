export function initNavigation(config){
 const nav=document.querySelector('header nav'),path=location.pathname.split('/').pop()||'index.html';
 const links=[['index.html','시장 현황'],['charts.html','차트'],['credit.html','신용잔고'],['reports.html','리포트'],['community.html','나의 매매일지'],['journals.html','당신들의 매매일지']];
 nav.replaceChildren();for(const[file,label]of links){const a=document.createElement('a');a.href='./'+file;a.textContent=label;if(path===file)a.setAttribute('aria-current','page');nav.append(a);}
 const account=document.createElement('a');account.href=config.privateJournalUrl;account.textContent='계좌 매매일지 🔒';account.dataset.private='';account.hidden=true;nav.append(account);
 // The owner-only account link is always the final menu entry.
 const current=nav.querySelector('[aria-current="page"]');if(current)nav.scrollLeft=Math.max(0,current.offsetLeft-nav.offsetLeft-nav.clientWidth+current.offsetWidth+12);
}
