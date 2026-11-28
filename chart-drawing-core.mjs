// Presentation annotations only. These values never enter indicators, signals or trade levels.
export const DRAWING_VERSION=1,MAX_DRAWINGS=50;
const validPoint=p=>p&&typeof p.at==='string'&&Number.isFinite(Date.parse(p.at))&&Number.isFinite(p.price)&&p.price>0&&p.price<1e15;
export const drawingDefaults=()=>({version:DRAWING_VERSION,lines:[],visible:true,auto:false,snap:true,extend:false,strength:3});
export function parseDrawings(raw){
 const out=drawingDefaults();let value;try{value=typeof raw==='string'&&raw.length<100000?JSON.parse(raw):raw;}catch{return out;}
 if(!value||value.version!==DRAWING_VERSION)return out;
 for(const key of['visible','auto','snap','extend'])if(typeof value[key]==='boolean')out[key]=value[key];
 if([2,3,5].includes(value.strength))out.strength=value.strength;
 const ids=new Set();for(const l of Array.isArray(value.lines)?value.lines:[]){
  if(out.lines.length>=MAX_DRAWINGS)break;
  if(typeof l?.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(l.id)||ids.has(l.id)||!Array.isArray(l.points)||l.points.length!==2||!l.points.every(validPoint)||Date.parse(l.points[0].at)===Date.parse(l.points[1].at))continue;
  ids.add(l.id);out.lines.push({id:l.id,points:l.points.map(p=>({at:p.at,price:p.price}))});
 }return out;
}
export function drawingStorageKey({market,symbol,frame}){return'chart-drawings-v1:'+market+':'+symbol+':'+frame;}
export function confirmedTrendLines(rows,{through=rows.length-1,strength=3,lookback=120}={}){
 strength=[2,3,5].includes(strength)?strength:3;through=Math.min(rows.length-1,Math.floor(through));const pivots={high:[],low:[]},valid=p=>p&&!p.provisional&&[p.high,p.low].every(v=>Number.isFinite(v)&&v>0);
 for(let i=Math.max(strength,through-lookback+1);i+strength<=through;i++){
  const window=rows.slice(i-strength,i+strength+1);if(!window.every(valid))continue;
  for(const kind of['high','low'])if(window.every((p,j)=>j===strength||(kind==='high'?rows[i].high>p.high:rows[i].low<p.low)))pivots[kind].push({at:rows[i].asOf,price:rows[i][kind],confirmedAt:rows[i+strength].asOf});
 }
 return Object.entries(pivots).flatMap(([kind,points])=>points.length<2?[]:[{id:'auto-'+kind,kind,points:points.slice(-2)}]);
}
export function clipDrawingSegment(a,b,{left,right,top,bottom}){
 if(![a.x,a.y,b.x,b.y,left,right,top,bottom].every(Number.isFinite))return null;
 let t0=0,t1=1;const dx=b.x-a.x,dy=b.y-a.y;
 for(const[p,q]of[[-dx,a.x-left],[dx,right-a.x],[-dy,a.y-top],[dy,bottom-a.y]]){
  if(p===0){if(q<0)return null;continue;}const t=q/p;if(p<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>t1)return null;
 }return[{x:a.x+t0*dx,y:a.y+t0*dy},{x:a.x+t1*dx,y:a.y+t1*dy}];
}
export function projectDrawingLine(line,rows,g,{extend=false}={}){
 const indices=line.points.map(p=>rows.findIndex(r=>Date.parse(r.asOf)===Date.parse(p.at)));if(indices.some(i=>i<0)||indices[0]===indices[1]||!(g.max>g.min))return null;
 let points=line.points.map((p,i)=>({x:g.left+(indices[i]-g.start+.5)*g.step,y:g.bottom-(p.price-g.min)/(g.max-g.min)*(g.bottom-g.top),index:indices[i]}));
 const ordered=[...points].sort((a,b)=>a.x-b.x),[a,b]=ordered,segment=clipDrawingSegment(a,b,g),end={x:g.right,y:b.y+(g.right-b.x)*(b.y-a.y)/(b.x-a.x)},extension=extend&&b.x<g.right?clipDrawingSegment(b,end,g):null;
 return{segment,extension,handles:points.map((p,index)=>({...p,index,visible:p.x>=g.left&&p.x<=g.right&&p.y>=g.top&&p.y<=g.bottom}))};
}
export function drawingAnchor(rows,g,x,y,{snap=true,currency='USD'}={}){
 if(x<g.left||x>g.right||y<g.top||y>g.bottom)return null;
 const index=Math.max(g.start,Math.min(g.end-1,Math.round((x-g.left)/g.step-.5)+g.start)),bar=rows[index];if(!bar)return null;
 let price=g.max-(y-g.top)/(g.bottom-g.top)*(g.max-g.min);
 if(snap){const candidates=[bar.high,bar.low].filter(v=>Number.isFinite(v)&&v>0);if(candidates.length)price=candidates.reduce((a,b)=>Math.abs(b-price)<Math.abs(a-price)?b:a);}
 else price=Number(price.toFixed(currency==='KRW'||currency==='JPY'?0:price<1?4:2));
 return Number.isFinite(price)&&price>0?{at:bar.asOf,price}:null;
}
