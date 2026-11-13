// View-only state: never changes indicator inputs or signal history.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function viewWindow(rows,state){
 const count=clamp(Math.round(state.count||rows.length),Math.min(8,rows.length),rows.length);
 let start=state.follow?rows.length-count:rows.findIndex(p=>p.asOf>=state.startAt);
 if(start<0)start=rows.length-count;start=clamp(start,0,rows.length-count);
 return{start,count,end:start+count};
}
export function setWindow(rows,state,start,count){
 count=clamp(Math.round(count),Math.min(8,rows.length),rows.length);start=clamp(Math.round(start),0,rows.length-count);
 Object.assign(state,{count,startAt:rows[start]?.asOf,follow:start+count===rows.length});return viewWindow(rows,state);
}
export function zoomWindow(rows,state,factor,anchor=.5){
 const w=viewWindow(rows,state),count=clamp(Math.round(w.count*factor),Math.min(8,rows.length),rows.length);
 return setWindow(rows,state,w.start+clamp(anchor,0,1)*(w.count-count),count);
}
export function scalePrice(range,factor,anchor=.5){
 const center=range.min+(range.max-range.min)*clamp(anchor,0,1),span=clamp((range.max-range.min)*factor,Math.max(Math.abs(center)*1e-6,1e-8),Math.max(Math.abs(center),1)*1e5);
 return{min:center-span*anchor,max:center+span*(1-anchor)};
}
// Pane sizes and empty viewing space affect presentation only, never the OHLCV series.
export function chartPaneLayout(height,fraction=.16){
 const h=Math.max(220,height),top=24,volumeBottom=h-32,usable=h-94;
 const volumeHeight=clamp(usable*(Number.isFinite(fraction)?fraction:.16),24,usable*.5),separator=volumeBottom-volumeHeight-28;
 return{top,volumeBottom,volumeHeight,separator,priceBottom:separator-10,usable,volumeFraction:volumeHeight/usable};
}
export function volumeFractionAt(height,separator){const p=chartPaneLayout(height);return clamp((p.volumeBottom-28-separator)/p.usable,24/p.usable,.5);}
export function chartHorizontalLayout(width,count,projection=0){
 const left=20,right=width-82,span=right-left,padding=clamp(span*.14,40,96),paddingSlots=count*padding/(span-padding),extra=Math.max(paddingSlots,projection);
 const step=span/(count+extra);return{left,right,step,extra,lastX:left+(count-.5)*step,padding:right-(left+(count-.5)*step)};
}
