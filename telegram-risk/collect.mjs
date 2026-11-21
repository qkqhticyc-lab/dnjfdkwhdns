import {parseCboe,parseYahoo,assess} from './core.mjs';
export async function collect({fetcher=fetch,now=new Date()}={}){
 const series={},errors=[];
 await Promise.all(['VIX','VIX3M','VIX6M','VIX9D','VVIX','SKEW','MOVE','DXY','SPX'].map(async id=>{
  try{
   const cboe=!['MOVE','DXY','SPX'].includes(id),symbol={MOVE:'^MOVE',DXY:'DX-Y.NYB',SPX:'^GSPC'}[id];
   const url=cboe?`https://cdn.cboe.com/api/global/us_indices/daily_prices/${id}_History.csv`:`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`;
   const response=await fetcher(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP '+response.status);
   series[id]=cboe?parseCboe(await response.text()):parseYahoo(await response.json());
  }catch{errors.push(id);series[id]=[];}
 }));
 return {...assess(series,{now}),sourceErrors:errors,sources:{volatility:'Cboe daily CSV',MOVE:'Yahoo Finance ^MOVE',DXY:'Yahoo Finance DX-Y.NYB',SPX:'Yahoo Finance ^GSPC'}};
}
