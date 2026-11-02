export const OPTIONS_SOURCE='https://m.daishin.com/g.ds?m=88&p=3647&v=2694';
const text=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
const number=s=>/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(s)?Number(s.replaceAll(',','')):null;
export function parseOptionSnapshot(html,now=new Date()){
 // Parse only the public table whose labels and unit are verified. Never eval page scripts.
 const table=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(x=>x[0]).find(t=>/KOSPI200콜옵션/.test(t)&&/KOSPI200풋옵션/.test(t));
 if(!table||!['시장구분','개인','외국인','기관계'].every(h=>table.includes(h))||!/(?:금액\s*:\s*백만원)/.test(text(html.slice(Math.max(0,html.indexOf(table)-500),html.indexOf(table)))))throw Error('Option table/unit unavailable');
 const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>text(c[1])));
 if(!rows.some(r=>r.join('|')==='시장구분|개인|외국인|기관계'))throw Error('Option column order mismatch');
 const items=['CALL','PUT'].map((code,i)=>{const name=`KOSPI200${i?'풋':'콜'}옵션`,row=rows.find(r=>r[0]===name);if(row?.length!==4)throw Error('Invalid option row');const values=row.slice(1).map(number);if(values.some(v=>v==null))throw Error('Missing option amounts');return{code,name,personalNet:values[0]/100,foreignNet:values[1]/100,institutionNet:values[2]/100,unit:'억원'};});
 // The source table does NOT publish a trade date/time. Do not invent one from the HTTP date or page processing clock.
 return{status:'ok',items,collectedAt:now.toISOString(),tradeAt:null,source:OPTIONS_SOURCE,sourceName:'대신증권 오늘의 증시',message:'제공처 최근 누적 순매수 금액 · 거래 기준시각 미제공. 장외에는 이전 거래 자료일 수 있습니다. 미결제약정은 제공하지 않습니다.'};
}
export async function collectOptions(fetcher=fetch,now=new Date()){
 try{const r=await fetcher(OPTIONS_SOURCE,{signal:AbortSignal.timeout(6500)});if(!r.ok)throw Error();return parseOptionSnapshot(await r.text(),now);}catch{return{status:'unavailable',collectedAt:now.toISOString(),tradeAt:null,source:OPTIONS_SOURCE,message:'콜·풋 수급 제공처 연결이 지연되고 있습니다.'};}
}
