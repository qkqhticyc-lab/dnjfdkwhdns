export const FLOW_VIEWS=[{code:'FUT',title:'외국인 선물',index:'K200 선물'},{code:'KOSPI',title:'외국인 코스피',index:'코스피'},{code:'KOSDAQ',title:'외국인 코스닥',index:'코스닥'}];
export function flowTone(percent){
 if(!Number.isFinite(percent))return{key:'unknown',label:'등락률 미제공',color:'#718078',background:'#f2f4f2',border:'#dce4de'};
 if(Math.abs(percent)<1e-10)return{key:'flat',label:'보합',color:'#61766b',background:'#f1f5f1',border:'#dce4de'};
 const up=percent>0,level=Math.abs(percent)+1e-9>=2?2:Math.abs(percent)+1e-9>=.5?1:0,palettes=up?[['#b44c78','#fff2f7','#eed1df'],['#d23e49','#fff0f1','#edc3c7'],['#ab1c31','#ffebee','#e8adb8']]:[['#5c87b0','#f2f8ff','#d0dff0'],['#286db9','#edf5ff','#bed5f0'],['#164b99','#e9f1ff','#abc5ec']],p=palettes[level];
 return{key:(up?'up':'down')+'-'+['weak','medium','strong'][level],label:(level===2?'강한 ':level===0?'완만한 ':'')+(up?'상승':'하락'),color:p[0],background:p[1],border:p[2]};
}
const validTime=t=>typeof t==='string'&&/^\d{2}:\d{2}$/.test(t)&&+t.slice(0,2)<24&&+t.slice(3)<60;
export function validFlowMarket(m,code){return m?.code===code&&m.seriesVersion===2&&m.scope===(code==='FUT'?'KRX':'KRX+NXT')&&['ok','stale'].includes(m.status)&&m.unit==='억원'&&m.measure==='netAmount'&&/^\d{4}-\d{2}-\d{2}$/.test(m.date||'')&&Array.isArray(m.points)&&m.points.length>0&&m.points.every((p,i)=>validTime(p.time)&&Number.isFinite(p.foreignNet)&&(!i||p.time>m.points[i-1].time))&&Array.isArray(m.prices)&&m.prices.length>0&&m.prices.every(p=>validTime(p.time)&&Number.isFinite(p.price)&&p.price>0);}
export function flowWindow(m){const points=m.points,prices=[...m.prices].sort((a,b)=>a.time.localeCompare(b.time)),first=[points[0].time,prices[0].time].sort()[0],last=[points.at(-1).time,prices.at(-1).time].sort().at(-1);return{points,prices,first,last};}
export function flowReading(m,window,time=null){const {points,prices}=window,current=time==null?points.at(-1):points.filter(p=>p.time<=time).at(-1)||points[0],before=points.filter(p=>{const minutes=t=>+t.slice(0,2)*60+(+t.slice(3));return minutes(p.time)<=minutes(current.time)-30;}).at(-1),price=time==null?prices.at(-1)||null:prices.filter(p=>p.time<=current.time).at(-1)||null;
 const change=price&&Number.isFinite(m.previousClose)&&m.previousClose>0?(price.price/m.previousClose-1)*100:price&&current===points.at(-1)&&Math.abs(price.price-m.price)<1e-8&&Number.isFinite(m.changePercent)?m.changePercent:null;
 return{current,price,change,delta:before?current.foreignNet-before.foreignNet:null};
}
