// Queue records contain only a two-minute signature, never the long-lived signing key.
export async function signWatchdog(secret,at,force=false){
 const bytes=new TextEncoder(),key=await crypto.subtle.importKey('raw',bytes.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes.encode(at+'.'+(force?'force':'scheduled'))))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyWatchdog(secret,signature,at,force=false,now=Date.now()){
 if(!secret||!/^\d{10}$/.test(at||'')||Math.abs(now-Number(at)*1000)>120000||!/^[a-f0-9]{64}$/.test(signature||''))return false;
 const expected=await signWatchdog(secret,at,force);let mismatch=0;for(let i=0;i<64;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);return mismatch===0;
}
