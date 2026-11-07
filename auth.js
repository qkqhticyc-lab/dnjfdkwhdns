import {createClient} from '@supabase/supabase-js';
export async function initAuth(config,onSession=()=>{}){
 const returnedFromOAuth=new URL(location.href).searchParams.has('code');
 const settings=config.supabase;
 if(!settings?.url||!settings.publishableKey)return null;
 const client=createClient(settings.url,settings.publishableKey,{auth:{flowType:'pkce',persistSession:true,detectSessionInUrl:true}});
 let initialized=false,lastUser;
 const signin=document.getElementById('signin'),signout=document.getElementById('signout');
 async function update(session){if(signin){signin.disabled=false;signin.hidden=!!session?.user;}if(signout)signout.hidden=!session?.user;document.querySelectorAll('[data-private]').forEach(n=>n.hidden=!session?.user||session.user.id!==config.journalOwnerId);if(initialized&&lastUser===session?.user?.id)return;initialized=true;lastUser=session?.user?.id;await onSession(session,client);}
 if(signin)signin.onclick=async()=>{const page=location.pathname.split('/').pop();sessionStorage.setItem('investment-return-page',['community.html','journals.html','reports.html','credit.html','charts.html','etfs.html','club.html'].includes(page)?page:'index.html');const {error}=await client.auth.signInWithOAuth({provider:'github',options:{redirectTo:new URL('./',location.href).href}});if(error)alert('로그인 연결을 확인해 주세요.');};
 if(signout)signout.onclick=async()=>{await client.auth.signOut({scope:'local'});};
 client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>update(session),0));
 const {data}=await client.auth.getSession();await update(data.session);
 const next=sessionStorage.getItem('investment-return-page');
 if(data.session&&returnedFromOAuth&&['community.html','journals.html','reports.html','credit.html','charts.html','etfs.html','club.html'].includes(next)){sessionStorage.removeItem('investment-return-page');location.replace(new URL(next,location.href));}
 return client;
}
