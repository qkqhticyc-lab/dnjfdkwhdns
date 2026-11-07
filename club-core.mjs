import{collectStockChart,localDate}from'./quotes-core.mjs';
import{chartPriceSummary}from'./chart-price.mjs';
export const CLUB_TARGETS=[
 {id:'r1-chanyoung',round:1,person:'김찬영',name:'HLB',market:'KR',symbol:'028300',currency:'KRW',target_price:90000,start_date:'2026-10-14',note:'목표가 9만 원으로 변경한 날부터 판정'},
 {id:'r2-jinsu',round:2,person:'이진수',name:'퀄컴',market:'US',symbol:'QCOM',currency:'USD',target_price:300,start_date:'2025-11-12'},
 {id:'r2-chanyoung',round:2,person:'김찬영',name:'셀트리온제약',market:'KR',symbol:'068760',currency:'KRW',target_price:120000,start_date:'2025-11-12'},
 {id:'r2-yechan',round:2,person:'최예찬',name:'POET',market:'US',symbol:'POET',currency:'USD',target_price:20,start_date:'2025-11-12'},
 {id:'r2-dayoung',round:2,person:'정다영',name:'알파벳 A',market:'US',symbol:'GOOGL',currency:'USD',target_price:471,start_date:'2025-11-12'},
 {id:'r2-changhyun',round:2,person:'백창현',name:'메타',market:'US',symbol:'META',currency:'USD',target_price:1010,start_date:'2025-11-12'},
 {id:'r3-jinsu',round:3,person:'이진수',name:'알파벳 C',market:'US',symbol:'GOOG',currency:'USD',target_price:450,start_date:'2026-10-14'},
 {id:'r3-chanyoung',round:3,person:'김찬영',name:'SK하이닉스',market:'KR',symbol:'000660',currency:'KRW',target_price:2500000,start_date:'2026-10-14'},
 {id:'r3-yechan',round:3,person:'최예찬',name:'인텔',market:'US',symbol:'INTC',currency:'USD',target_price:240,start_date:'2026-10-14'},
 {id:'r3-dayoung',round:3,person:'정다영',name:'삼성전자',market:'KR',symbol:'005930',currency:'KRW',target_price:350000,start_date:'2026-10-14'},
 {id:'r3-changhyun',round:3,person:'백창현',name:'스페이스엑스',market:'US',symbol:'SPCX',currency:'USD',target_price:250,start_date:'2026-10-14'}
];
export const CLUB_PEOPLE=['이진수','김찬영','최예찬','정다영','백창현'];
const positive=v=>Number.isFinite(v)&&v>0;
export function clubMetrics(row){const price=row.quote?.price,valid=positive(price),target=row.target_price;return{achieved:!!row.hit_date,gap:valid?(target/price-1)*100:null,progress:valid?Math.max(0,Math.min(100,price/target*100)):null};}
export function evaluateClubHistory(target,history,previous={},now=new Date()){
 if(history.market!==target.market||history.symbol!==target.symbol||history.currency!==target.currency||!Array.isArray(history.bars))throw Error('Club history identity mismatch');
 const today=localDate(now.getTime()/1000,history.timezone),all=history.bars.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')&&p.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
 const period=all.filter(p=>p.date>=target.start_date),valid=period.filter(p=>[p.open,p.high,p.low,p.close].every(positive)&&p.high>=Math.max(p.open,p.low,p.close)&&p.low<=Math.min(p.open,p.high,p.close));
 const first=valid.find(p=>p.high>=target.target_price),peak=valid.reduce((best,p)=>!best||p.high>best.high?p:best,null),summary=chartPriceSummary(history);
 const coverage=!!(all.length&&((all[0].date<=target.start_date)||(previous.history_complete&&all[0].date<=previous.history_through)));
 const quote=summary&&Date.parse(summary.priceDate.slice(0,10))<=Date.parse(today)?{price:summary.price,asOf:summary.priceDate,kind:summary.source,changePercent:summary.percent,delayMinutes:history.quote?.delayMinutes??null}:null;
 const complete=coverage&&period.length>0&&valid.length===period.length;
 return{id:target.id,target_price:target.target_price,start_date:target.start_date,checked_at:now.toISOString(),check_status:complete&&quote?'ok':'partial',quote,history_complete:complete,history_from:valid[0]?.date||null,history_through:valid.at(-1)?.date||null,hit_date:first?.date||null,hit_high:first?.high||null,peak_price:peak?.high||null,peak_date:peak?.date||null,source_url:history.source};
}
export async function collectClubObservations(targets,loader=collectStockChart,now=new Date()){
 const out=Array(targets.length);let at=0;await Promise.all(Array.from({length:Math.min(3,targets.length)},async()=>{while(at<targets.length){const i=at++,t=targets[i];try{const recent=t.history_complete&&Date.parse(t.checked_at)>now.getTime()-20*86400000,history=await loader({...t,range:recent?'1mo':'2y',includeQuote:true});out[i]=evaluateClubHistory(t,history,t,now);}catch{out[i]={id:t.id,target_price:t.target_price,start_date:t.start_date,checked_at:now.toISOString(),check_status:'unavailable'};}}}));return out;
}
