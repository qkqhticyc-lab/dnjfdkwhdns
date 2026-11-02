// Both values come from the same provider's daily series and use its price adjustment basis.
export function chartPriceSummary(data){
 const bars=data?.bars,last=bars?.at(-1),previous=bars?.at(-2);
 if(!Number.isFinite(last?.close)||last.close<=0)return null;
 const validReference=Number.isFinite(previous?.close)&&previous.close>0&&/^\d{4}-\d{2}-\d{2}$/.test(previous.date||'')&&previous.date<last.date;
 const percent=validReference?(last.close/previous.close-1)*100:null;
 return{price:last.close,percent,direction:percent==null?'unknown':percent>0?'up':percent<0?'down':'flat',priceDate:last.date,referenceDate:validReference?previous.date:null};
}
