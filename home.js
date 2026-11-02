async function bootHome() {
  loadForUser(localSession());renderCourses();showIdentity(localSession());
  document.getElementById('appview').style.display='';
  const s=await getSession();if(userKey(s)!==_ukey)loadForUser(s);showIdentity(s);
  if(!s.local)await pushState();else setSyncLabel('本地已保存 · 登录后可云同步');
}
function showIdentity(s) {
  document.getElementById('who').textContent=s.local?'本机学习记录可用；云端暂未连接。':'当前账号：'+(s.user.email||s.user.id)+' · 已开启自动登录';
  document.getElementById('authview').hidden=!s.local||s.user.id!==LOCAL_UID;
  document.getElementById('signout').hidden=!!s.local;
}
async function submitAuth(event) {
  event.preventDefault();const btn=document.getElementById('btn-go'),msg=document.getElementById('e-msg');btn.disabled=true;msg.textContent='正在登录…';
  try {
    const {data,error}=await initCloud().auth.signInWithPassword({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value});
    if(error)throw error;if(!data.session)throw Error('未取得有效会话');document.getElementById('password').value='';
    const s={user:{id:data.session.user.id,email:data.session.user.email}};
    localStorage.setItem('mb_last_user',JSON.stringify(s.user));CLOUD_DOWN=false;loadForUser(s);showIdentity(s);renderCourses();
    await pushState();msg.textContent='';toast('登录成功，之后会自动登录');
  }catch(e){msg.textContent='登录失败：'+e.message+'。本地题库仍可使用。';}finally{btn.disabled=false;}
}
function showLogin(){const box=document.getElementById('authview');box.hidden=false;document.getElementById('email').focus();box.scrollIntoView({block:'center'});}
function renderCourses() {
  const box=document.getElementById('courses');let html='';
  for(const [tk,v] of Object.entries(window.META||{})){
    const total=v.chapters.reduce((s,c)=>s+c.total,0);
    const chips=v.chapters.map((c,i)=>'<a class="chip" href="ch.html?tk='+tk+'&c='+i+'">'+escHtml(c.name)+' <b>'+c.total+'</b> 题</a>').join('');
    html+='<div class="tk-card"><div class="tk-head"><span class="tk-name">'+escHtml(v.name)+'</span><span class="tk-count">共 '+total+' 题 · '+v.chapters.length+' 章</span></div><div class="chips">'+chips+'</div></div>';
  }
  box.innerHTML=html;
}
document.getElementById('imp-file').addEventListener('change',e=>{if(e.target.files[0])void importOldData(e.target.files[0]);});
void bootHome();
