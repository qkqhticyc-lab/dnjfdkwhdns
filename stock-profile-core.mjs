const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function parseKoreanProfile(html,symbol){
 const block=html.match(/<h5 class="bg7">기업개요<\/h5>([\s\S]*?)<h5 class="bg8">/)?.[1];if(!block)throw Error('Company description unavailable');
 const rows=[...block.matchAll(/<li[^>]*data-cd="([A-Z0-9]{6})"[^>]*>([\s\S]*?)<\/li>/g)].filter(m=>m[1]===symbol).map(m=>clean(m[2]));if(!rows.length)throw Error('Company identity mismatch');
 return{summary:rows.slice(0,2).join(' ').slice(0,450),sourceAsOf:block.match(/기준:(\d{4}\.\d{2}\.\d{2})/)?.[1]?.replaceAll('.','-')||null};
}
export async function collectStockProfile({market,symbol,provider},fetcher=fetch,now=new Date()){
 if(market==='KR'?!/^[0-9A-Z]{6}$/.test(symbol):market==='US'?!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol)||!/^[A-Za-z0-9.-]{1,30}$/.test(provider||''):true)throw Error('Invalid stock');
 const get=async(url,json=true)=>{const r=await fetcher(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Profile source unavailable');return json?r.json():r.text();};
 if(market==='KR'){const source='https://comp.wisereport.co.kr/company/c1010001.aspx?cmp_cd='+symbol;return{schemaVersion:1,market,symbol,...parseKoreanProfile(await get(source,false),symbol),fetchedAt:now.toISOString(),source};}
 const[basic,detail]=await Promise.all([get('https://api.stock.naver.com/stock/'+provider+'/basic'),get('https://api.stock.naver.com/stock/'+provider+'/integration')]);if(basic.reutersCode!==provider||basic.symbolCode!==symbol||basic.stockEndType!=='stock')throw Error('Company identity mismatch');const summary=clean(detail.corporateOverview||detail.summaries?.summary).split(/(?<=\.)\s+/).slice(0,2).join(' ').slice(0,450);if(!summary)throw Error('Company description unavailable');return{schemaVersion:1,market,symbol,summary,sourceAsOf:null,fetchedAt:now.toISOString(),source:'https://stock.naver.com/worldstock/stock/'+provider+'/overview'};
}
