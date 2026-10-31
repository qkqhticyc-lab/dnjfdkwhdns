import { createClient } from '@supabase/supabase-js';
const $=id=>document.getElementById(id);
let client=null,user=null,entries=[],commentOffset=0,loading=false,authGeneration=0,sessionInitialized=false;
const entryFields='id,owner_id,trade_date,market,symbol,stock_name,side,quantity,price,reason,review,created_at';
function el(tag,text,className){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;}
function tell(text,bad=false){const box=$('member-status');box.textContent=text;box.classList.toggle('is-error',bad);box.hidden=!text;}
function failure(error){tell(error.message?.includes('COMMENT_RATE_LIMIT')?'잠시 쉬었다가 댓글을 다시 작성해 주세요.':'요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',true);}
function enableForms(on){document.querySelectorAll('[data-member-only]').forEach(n=>n.disabled=!on);}
function renderEntries(){
  const list=$('entry-list');list.replaceChildren();
  $('entry-count').textContent=entries.length+'건';
  if(!user){list.append(el('p','로그인하면 본인의 매매일지만 불러옵니다.','empty-message'));return;}
  if(!entries.length){list.append(el('p','아직 기록이 없습니다. 첫 매매를 기록해 보세요.','empty-message'));return;}
  for(const entry of entries){
    const card=el('article',null,'entry-card'),head=el('div',null,'entry-head');
    const title=el('div');title.append(el('small',`${entry.trade_date} · ${entry.market==='KR'?'국내':'미국'} · ${entry.symbol}`),el('h3',entry.stock_name));
    head.append(title,el('span',entry.side==='buy'?'매수':'매도','trade-side '+entry.side));card.append(head);
    const currency=entry.market==='KR'?'KRW':'USD';
    card.append(el('p',`${Number(entry.quantity).toLocaleString('ko-KR',{maximumFractionDigits:8})}주 × ${new Intl.NumberFormat('ko-KR',{style:'currency',currency,maximumFractionDigits:4}).format(entry.price)}`,'entry-numbers'));
    if(entry.reason){card.append(el('b','매매 이유'),el('p',entry.reason));}
    if(entry.review){card.append(el('b','매매 복기'),el('p',entry.review));}
    const actions=el('div',null,'entry-actions'),edit=el('button','수정'),remove=el('button','삭제');
    edit.type=remove.type='button';edit.onclick=()=>{
      const form=$('entry-form');for(const name of ['id','trade_date','market','symbol','stock_name','side','quantity','price','reason','review'])form.elements[name].value=entry[name]??'';
      $('entry-form-title').textContent='매매일지 수정';$('cancel-edit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'center'});form.elements.stock_name.focus();
    };
    remove.onclick=async()=>{if(!confirm('이 매매일지를 삭제할까요?'))return;remove.disabled=true;try{const {error}=await client.from('investment_entries').delete().eq('id',entry.id).eq('owner_id',user.id);if(error)throw error;await loadEntries();tell('매매일지를 삭제했습니다.');}catch(e){failure(e);}finally{remove.disabled=false;}};
    actions.append(edit,remove);card.append(actions);list.append(card);
  }
}
async function loadEntries(){
  const generation=authGeneration;
  if(!user){entries=[];renderEntries();return;}
  const {data,error}=await client.from('investment_entries').select(entryFields).eq('owner_id',user.id).order('trade_date',{ascending:false}).order('created_at',{ascending:false}).limit(501);
  if(generation!==authGeneration)return;
  if(error)throw error;entries=data.slice(0,500);renderEntries();$('entry-limit').hidden=data.length<=500;
}
async function loadComments(reset=true){
  if(!client)return;
  const generation=authGeneration;if(reset)commentOffset=0;
  const {data,error}=await client.from('investment_comments').select('id,owner_id,nickname,body,created_at').order('created_at',{ascending:false}).range(commentOffset,commentOffset+19);
  if(generation!==authGeneration)return;
  if(error)throw error;
  const list=$('comment-list');if(reset)list.replaceChildren();
  if(reset&&!data.length)list.append(el('p','첫 번째 생각을 나눠보세요.','empty-message'));
  for(const comment of data){const card=el('article',null,'comment'),head=el('div');head.append(el('b',comment.nickname),el('small',new Date(comment.created_at).toLocaleString('ko-KR')));card.append(head,el('p',comment.body));
    if(user?.id===comment.owner_id){const remove=el('button','내 댓글 삭제');remove.onclick=async()=>{if(!confirm('이 댓글을 삭제할까요?'))return;remove.disabled=true;try{const {error}=await client.from('investment_comments').delete().eq('id',comment.id).eq('owner_id',user.id);if(error)throw error;await loadComments();}catch(e){failure(e);}finally{remove.disabled=false;}};card.append(remove);}list.append(card);}
  commentOffset+=data.length;$('more-comments').hidden=data.length<20;
}
function resetEntry(){const form=$('entry-form');form.reset();form.elements.id.value='';form.elements.trade_date.value=new Date(Date.now()+9*3600000).toISOString().slice(0,10);$('entry-form-title').textContent='매매 기록하기';$('cancel-edit').hidden=true;}
async function setSession(session){
  if(sessionInitialized&&user?.id===session?.user?.id)return;
  sessionInitialized=true;
  authGeneration++;user=session?.user||null;entries=[];renderEntries();resetEntry();enableForms(!!user);
  $('signin').hidden=!!user;$('signout').hidden=!user;$('account-label').textContent=user?'로그인됨 · 나의 비공개 기록':'로그인 후 작성할 수 있습니다';
  if(!user)$('comment-form').reset();
  try{await Promise.all([loadEntries(),loadComments()]);}catch(error){failure(error);}
}
export async function initMembers(config){
  resetEntry();enableForms(false);renderEntries();
  const settings=config.supabase;
  if(!settings?.url||!settings.publishableKey){tell('현재 준비 화면입니다. 회원 로그인과 저장은 서비스 연결 후 사용할 수 있습니다.');$('signin').disabled=true;return;}
  const url=new URL(settings.url);if(url.protocol!=='https:'||settings.publishableKey.startsWith('sb_secret_'))throw Error('Invalid public configuration');
  client=createClient(url.href,settings.publishableKey,{auth:{flowType:'pkce',persistSession:true,detectSessionInUrl:true}});
  tell('');
  $('signin').disabled=false;
  $('signin').onclick=async()=>{const {error}=await client.auth.signInWithOAuth({provider:settings.authProvider||'github',options:{redirectTo:new URL('./',location.href).href}});if(error)failure(error);};
  $('signout').onclick=async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)failure(error);else tell('로그아웃했습니다.');};
  client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>setSession(session),0);});
  const {data,error}=await client.auth.getSession();if(error)throw error;await setSession(data.session);
  $('cancel-edit').onclick=resetEntry;
  $('more-comments').onclick=async()=>{const button=$('more-comments');button.disabled=true;try{await loadComments(false);}catch(e){failure(e);}finally{button.disabled=false;}};
  $('entry-form').onsubmit=async event=>{
    event.preventDefault();if(!user||loading)return;loading=true;const button=$('save-entry');button.disabled=true;
    try{const f=new FormData(event.currentTarget);const row={owner_id:user.id,trade_date:f.get('trade_date'),market:f.get('market'),symbol:String(f.get('symbol')).trim().toUpperCase(),stock_name:String(f.get('stock_name')).trim(),side:f.get('side'),quantity:Number(f.get('quantity')),price:Number(f.get('price')),reason:String(f.get('reason')).trim(),review:String(f.get('review')).trim()};
      if(!Number.isFinite(row.quantity)||!Number.isFinite(row.price)||row.quantity<=0||row.price<=0)throw Error('invalid numbers');
      const id=f.get('id');const query=id?client.from('investment_entries').update(row).eq('id',id).eq('owner_id',user.id):client.from('investment_entries').insert(row);
      const {error}=await query;if(error)throw error;resetEntry();await loadEntries();tell('나의 비공개 매매일지에 저장했습니다.');
    }catch(error){failure(error);}finally{loading=false;button.disabled=!user;}
  };
  $('comment-form').onsubmit=async event=>{
    event.preventDefault();if(!user||loading)return;loading=true;const button=$('save-comment'),form=event.currentTarget;button.disabled=true;
    try{const f=new FormData(form);const {error}=await client.from('investment_comments').insert({owner_id:user.id,nickname:String(f.get('nickname')).trim(),body:String(f.get('body')).trim()});if(error)throw error;form.elements.body.value='';await loadComments();tell('댓글을 공개 게시했습니다.');}catch(error){failure(error);}finally{loading=false;button.disabled=!user;}
  };
  $('export-entries').onclick=()=>{if(!user)return;const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),entries},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='my-investment-journal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
