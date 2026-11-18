import {passesLiquidity,excludedStock} from './screener-core.mjs';
import {screenEntryType} from './entry-types.mjs';
import {rankScreenItem} from './screener-rank.mjs';
import {liveDailyRows} from './live-chart-core.mjs';

export function loungeStocks(items,market,type='all') {
  const available=items.filter(item=>item.market===market&&item.status==='ok'&&/^\d{4}-\d{2}-\d{2}$/.test(item.asOf||''));
  const asOf=available.reduce((date,item)=>item.asOf>date?item.asOf:date,'');
  const rows=available.filter(item=>item.asOf===asOf&&!excludedStock(item)&&passesLiquidity(item,'standard'));
  const active=rows.filter(item=>item.signal?.status==='active');
  const matches=item=>type==='all'||screenEntryType(item.signal)===type;
  const sort=list=>list.filter(matches).map(item=>({...item,priority:rankScreenItem(item)})).sort((a,b)=>(b.priority?.score??0)-(a.priority?.score??0)||(a.signal?.age??999)-(b.signal?.age??999));
  return {asOf,rows,new:sort(active.filter(item=>item.signal.age<3)),active:sort(active),setup:sort(rows.filter(item=>item.state==='setup')),
    breadth:rows.length?rows.filter(item=>item.trend==='up').length/rows.length*100:null};
}

export function loungeTrend(daily,market,now=new Date()) {
  const rows=liveDailyRows({market,timezone:market==='KR'?'Asia/Seoul':'America/New_York',bars:(daily?.points||[]).map(point=>({date:point.date,close:point.close}))},now).filter(row=>!row.provisional&&Number.isFinite(row.close));
  const last=rows.at(-1),average=length=>rows.length>=length?rows.slice(-length).reduce((sum,row)=>sum+row.close,0)/length:null;
  const ma20=average(20),ma60=average(60);
  const state=ma20===null||ma60===null?'unknown':last.close>ma20&&ma20>ma60?'up':last.close<ma20&&ma20<ma60?'down':'mixed';
  return {state,asOf:last?.asOf||null,ma20,ma60,close:last?.close??null};
}

export function loungeSectors(rows,classifications) {
  const groups=new Map();
  for(const row of rows){const sector=classifications.get(row.market+':'+row.symbol)?.id;if(!sector||sector==='unknown'||!Number.isFinite(row.changePercent))continue;
    const group=groups.get(sector)||{id:sector,count:0,total:0};group.count++;group.total+=row.changePercent;groups.set(sector,group);}
  return [...groups.values()].filter(group=>group.count>=3).map(group=>({...group,average:group.total/group.count})).sort((a,b)=>b.average-a.average);
}
