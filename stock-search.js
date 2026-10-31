import {defaultCurrencies,marketLabels} from './stock-search-core.mjs';
export function initStockSearch(config,form){
 const name=form.elements.stock_name,symbol=form.elements.symbol,market=form.elements.market,currency=form.elements.price_currency,side=form.elements.side;
 const box=document.getElementById('stock-suggestions'),status=document.getElementById('stock-search-status');
 let timer,controller,generation=0,selectedIndex=-1,items=[];
 name.setAttribute('role','combobox');name.setAttribute('aria-autocomplete','list');name.setAttribute('aria-controls',box.id);name.setAttribute('aria-expanded','false');
 const close=()=>{box.hidden=true;box.replaceChildren();name.setAttribute('aria-expanded','false');name.removeAttribute('aria-activedescendant');selectedIndex=-1;};
 function priceLabel(){const allowed={KR:['KRW'],US:['USD'],HK:['HKD','CNY','USD'],JP:['JPY']}[market.value];for(const option of currency.options)option.disabled=!allowed.includes(option.value);if(!allowed.includes(currency.value))currency.value=defaultCurrencies[market.value];document.getElementById('trade-price-label').textContent=(side.value==='sell'?'매도가':'매수가')+' ('+currency.value+')';}
 function choose(item){if(symbol.value!==item.symbol||market.value!==item.market||currency.value!==item.currency)form.elements.trade_price.value='';name.value=item.name;symbol.value=item.symbol;market.value=item.market;currency.value=item.currency;priceLabel();close();status.textContent=`${marketLabels[item.market]} · ${item.exchange} · ${item.symbol} 선택됨`;}
 async function search(){const q=name.value.trim(),g=++generation;controller?.abort();close();if(!q)return;controller=new AbortController();status.textContent='종목을 검색하고 있습니다.';
  try{const url=new URL(config.supabase.url+'/functions/v1/stock-search');url.searchParams.set('q',q);url.searchParams.set('market',market.value);const r=await fetch(url,{headers:{apikey:config.supabase.publishableKey,Authorization:'Bearer '+config.supabase.edgeAnonKey},signal:controller.signal});if(!r.ok)throw Error();const d=await r.json();if(g!==generation)return;items=Array.isArray(d.items)?d.items:[];box.replaceChildren();
   for(const [i,item]of items.entries()){const b=document.createElement('button');b.type='button';b.id='stock-option-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected','false');b.textContent=`${item.name} · ${item.symbol} · ${marketLabels[item.market]} / ${item.exchange}`;b.onpointerdown=e=>e.preventDefault();b.onclick=()=>choose(item);box.append(b);}
   box.hidden=!items.length;name.setAttribute('aria-expanded',String(!!items.length));status.textContent=items.length?'검색 결과를 선택하면 시장·종목코드가 자동 입력됩니다.':'일치하는 종목이 없습니다. 이름이나 코드를 바꾸거나 직접 입력하세요.';
  }catch(e){if(e.name!=='AbortError'&&g===generation)status.textContent='검색 연결이 지연되고 있습니다. 종목명과 코드를 직접 입력할 수 있습니다.';}
 }
 name.addEventListener('input',()=>{clearTimeout(timer);generation++;controller?.abort();symbol.value='';close();timer=setTimeout(search,300);});
 name.addEventListener('keydown',e=>{if(box.hidden)return;if(e.key==='Escape'){close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();selectedIndex=selectedIndex<0?(e.key==='ArrowDown'?0:items.length-1):(selectedIndex+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;[...box.children].forEach((b,i)=>b.setAttribute('aria-selected',String(i===selectedIndex)));name.setAttribute('aria-activedescendant','stock-option-'+selectedIndex);}if(e.key==='Enter'){e.preventDefault();if(selectedIndex>=0)choose(items[selectedIndex]);}});
 name.addEventListener('blur',()=>setTimeout(close,160));
 market.addEventListener('change',()=>{symbol.value='';form.elements.trade_price.value='';currency.value=defaultCurrencies[market.value];priceLabel();clearTimeout(timer);if(name.value.trim())search();});
 side.addEventListener('change',priceLabel);currency.addEventListener('change',priceLabel);
 priceLabel();
 return {reset(){clearTimeout(timer);generation++;controller?.abort();close();status.textContent='종목명이나 티커로 한국·미국·홍콩·일본 종목을 검색하세요.';priceLabel();},priceLabel};
}
