const positive=n=>Number.isFinite(n)&&n>0;
export function clubChartGeometry(row,width=520,height=220){
 const records=new Map();for(const p of row.price_history||[])if(/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')&&p.date>=row.start_date&&positive(p.close)&&positive(p.high)&&p.high>=p.close)records.set(p.date,p);
 const data=[...records.values()].sort((a,b)=>a.date.localeCompare(b.date));if(!data.length||!positive(row.target_price))return null;
 const left=52,right=Math.max(left+1,width-14),top=25,bottom=height-28,start=Date.parse(row.start_date+'T00:00:00Z'),end=Math.max(start+86400000,Date.parse(data.at(-1).date+'T00:00:00Z')),values=data.flatMap(p=>[p.close,p.high]).concat(row.target_price),min=Math.min(...values),max=Math.max(...values),pad=(max-min||max*.1)*.13,low=Math.max(0,min-pad),high=max+pad;
 const x=date=>left+(Date.parse(date+'T00:00:00Z')-start)/(end-start)*(right-left),y=value=>bottom-(value-low)/(high-low)*(bottom-top);
 return{width,height,left,right,top,bottom,low,high,targetY:y(row.target_price),points:data.map(p=>({...p,x:x(p.date),y:y(p.close),highY:y(p.high)}))};
}
