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
