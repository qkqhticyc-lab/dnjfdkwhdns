// One refresh per key per isolate, including concurrent visitors. Failure retains the original timestamps.
export function createRequestCache({ttl=20000,now=()=>Date.now()}={}){
 const entries=new Map();
 return async function get(key,loader,merge=(n)=>n){
  let e=entries.get(key);if(e?.pending)return e.pending;if(e&&e.expires>now())return e.value;
  if(!e){e={};entries.set(key,e);}
  e.pending=(async()=>{try{e.value=merge(await loader(),e.value);e.expires=now()+ttl;return e.value;}finally{e.pending=null;}})();return e.pending;
 };
}
