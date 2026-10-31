const $=id=>document.getElementById(id);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
export function initCommunity(config){
 let client,user,generation=0,offset=0,editing=null;
 const fields='id,owner_id,nickname,trade_date,market,symbol,stock_name,side,reason,review,source,created_at';
 const tell=text=>{$('community-status').textContent=text;};
 const failure=()=>tell('처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
 function reset(){editing=null;$('post-form').reset();$('post-form').elements.trade_date.value=new Date(Date.now()+9*3600000).toISOString().slice(0,10);$('post-save').textContent='매매일지 공개하기';}
 async function comments(post,host){
  host.replaceChildren();const {data,error}=await client.from('journal_post_comments').select('id,owner_id,nickname,body,created_at').eq('post_id',post.id).order('created_at',{ascending:true}).limit(100);if(error)return failure();
  for(const c of data){const node=el('div',null,'comment');node.append(el('b',c.nickname),el('p',c.body),el('small',new Date(c.created_at).toLocaleString('ko-KR')));if(user?.id===c.owner_id){const remove=el('button','내 댓글 삭제');remove.onclick=async()=>{const {error}=await client.from('journal_post_comments').delete().eq('id',c.id);if(error)failure();else comments(post,host);};node.append(remove);}host.append(node);}
  if(!data.length)host.append(el('p','첫 의견을 남겨보세요.','empty-message'));
  if(user){const form=el('form'),nick=el('input'),body=el('textarea'),submit=el('button','댓글 남기기');nick.name='nickname';nick.placeholder='공개 닉네임';nick.value=$('post-form').elements.nickname.value||'';nick.required=true;nick.maxLength=30;nick.setAttribute('aria-label','댓글 닉네임');body.name='body';body.placeholder='이 매매에 대한 생각을 나눠보세요.';body.setAttribute('aria-label','댓글 내용');body.required=true;body.maxLength=2000;form.append(nick,body,submit);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;const {error}=await client.from('journal_post_comments').insert({post_id:post.id,nickname:nick.value.trim(),body:body.value.trim()});if(error){failure();submit.disabled=false;}else comments(post,host);};host.append(form);}else host.append(el('p','로그인하면 댓글을 남길 수 있습니다.','source-note'));
 }
 function card(post){
  const node=el('article',null,'panel shared-post'),head=el('div',null,'shared-post-heading');head.append(el('h2',post.stock_name),el('span',post.side==='buy'?'매수':'매도','trade-side '+post.side));node.append(head);
  node.append(el('p',`${post.nickname} · ${post.trade_date} · ${post.market==='KR'?'국내':'미국'} · ${post.symbol}`,'post-meta'),el('span',post.source==='account'?'계좌 일지 연동':'직접 공유','privacy-badge'));
  if(post.reason)node.append(el('h3','매매 이유'),el('p',post.reason,'post-prose'));
  if(post.review)node.append(el('h3','매매 복기'),el('p',post.review,'post-prose'));
  if(!post.reason&&!post.review)node.append(el('p','매매 이유와 복기는 작성 후 반영됩니다.','source-note'));
  if(user?.id===post.owner_id){const actions=el('div',null,'entry-actions');if(post.source==='manual'){const edit=el('button','수정');edit.onclick=()=>{editing=post.id;const f=$('post-form');for(const key of ['nickname','trade_date','market','symbol','stock_name','side','reason','review'])f.elements[key].value=post[key]||'';$('post-save').textContent='공유 일지 수정';f.scrollIntoView({behavior:'smooth'});};actions.append(edit);}const remove=el('button','공개 글 삭제');remove.onclick=async()=>{if(!confirm('공개 글과 댓글을 삭제할까요?'))return;const {error}=await client.from('journal_posts').delete().eq('id',post.id);if(error)failure();else load(true);};actions.append(remove);node.append(actions);}
  const open=el('button','댓글 보기 · 의견 남기기'),host=el('div');open.onclick=()=>{open.disabled=true;comments(post,host).finally(()=>{open.disabled=false;});};node.append(open,host);return node;
 }
 async function load(resetFeed=true){if(!client)return;const g=generation;if(resetFeed)offset=0;const {data,error}=await client.from('journal_posts').select(fields).order('created_at',{ascending:false}).range(offset,offset+19);if(g!==generation)return;if(error)return failure();const list=$('shared-posts');if(resetFeed)list.replaceChildren();if(resetFeed&&!data.length)list.append(el('p','아직 공유된 일지가 없습니다. 첫 기록을 나눠보세요.','empty-message'));for(const post of data)list.append(card(post));offset+=data.length;$('posts-more').hidden=data.length<20;}
 reset();$('posts-more').onclick=()=>load(false);
 $('post-cancel').onclick=reset;
 $('post-form').onsubmit=async e=>{e.preventDefault();if(!user)return;const f=new FormData(e.currentTarget),row={};for(const key of ['nickname','trade_date','market','symbol','stock_name','side','reason','review'])row[key]=String(f.get(key)||'').trim();row.symbol=row.symbol.toUpperCase();$('post-save').disabled=true;const {error}=await(editing?client.from('journal_posts').update(row).eq('id',editing):client.from('journal_posts').insert(row));$('post-save').disabled=false;if(error)failure();else{reset();tell('매매일지를 공개했습니다.');load(true);}};
 $('link-sharing').onclick=async()=>{
  if(!user)return;const nickname=$('share-nickname').value.trim();if(!nickname){tell('공개할 닉네임을 입력해 주세요.');return;}
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const {error}=await client.from('journal_share_links').upsert({owner_id:user.id,token_hash:hash,nickname,enabled:true});if(error)return failure();
  $('share-code').value=token;$('share-connection').hidden=false;$('open-private-sharing').href=config.privateJournalUrl+'#share='+token;tell('연결 준비가 됐습니다. 계좌 일지에서 한 번 연결하면 새 기록이 자동 공유됩니다.');
 };
 $('copy-share-code').onclick=async()=>{try{await navigator.clipboard.writeText($('share-code').value);tell('연결 코드를 복사했습니다. 계좌 앱의 공유 연결란에 붙여 넣으세요.');}catch{tell('연결 코드를 선택해서 복사해 주세요.');}};
 $('revoke-sharing').onclick=async()=>{if(!user)return;const {error}=await client.from('journal_share_links').delete().eq('owner_id',user.id);if(error)failure();else{$('share-code').value='';$('share-connection').hidden=true;tell('새 기록의 자동 공유를 중지했습니다. 공개된 글은 개별 삭제할 수 있습니다.');}};
 return {async onSession(session,c){client=c;user=session?.user||null;generation++;$('share-code').value='';$('share-connection').hidden=true;reset();document.querySelectorAll('[data-member-only]').forEach(n=>n.disabled=!user);$('community-account').textContent=user?'로그인됨 · 작성한 일지는 누구나 볼 수 있습니다.':'누구나 읽고, 로그인 후 일지와 댓글을 작성할 수 있습니다.';await load(true);}};
}
