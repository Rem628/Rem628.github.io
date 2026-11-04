/* Backups exclude passwords and authentication tokens. */
function downloadJSON(name,data) {
  const json=JSON.stringify(data,null,2);
  if(window.AndroidBackup?.save) {window.AndroidBackup.save(json);return;}
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function accountSnapshot(uid) {
  if(uid===_ukey)return cleanState(snapshot());
  const p=cleanState(_read('NEU-STATE:'+uid,null)||legacyState(uid));
  const draft=_read('NEU-DRAFT:'+uid,null);if(draft&&validExam(draft)&&!p.drafts[draft.id])p.drafts[draft.id]=draft;
  return p;
}
function exportBackup({allAccounts=false}={}) {
  const accounts={};
  if(allAccounts)for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i),m=key.match(/^NEU-(?:STATE|REC|FAV|EXAMS|EXDEL|RECDEL|FAVT|DRAFT):([A-Za-z0-9_-]+)$/);
    if(!m||accounts[m[1]])continue;const uid=m[1];
    accounts[uid]=accountSnapshot(uid);
  }
  if(_ukey)accounts[_ukey]=accountSnapshot(_ukey);
  downloadJSON('大学题库备份-'+new Date().toISOString().slice(0,10)+'.json',{format:'mathbank-backup',version:3,scope:allAccounts?'all-local-accounts':'current-account',exportedAt:new Date().toISOString(),accounts});
  toast('已生成备份，请妥善保存文件');
}
function legacyState(uid){return {rec:_read('NEU-REC:'+uid,{}),fav:_read('NEU-FAV:'+uid,[]),exams:_read('NEU-EXAMS:'+uid,[]),exdel:_read('NEU-EXDEL:'+uid,{}),recdel:_read('NEU-RECDEL:'+uid,{}),favT:_read('NEU-FAVT:'+uid,0)};}
function validateImport(p) {
  if(!validObject(p))throw Error('记录格式错误');const c=cleanState(p);
  for(const key of ['rec','exdel','recdel','favOps'])if(p[key]!==undefined&&(!validObject(p[key])||Object.keys(c[key]).length!==Object.keys(p[key]).length))throw Error(key+' 字段无效');
  if(p.fav!==undefined&&(!Array.isArray(p.fav)||p.fav.some(id=>!safeId(id))))throw Error('收藏编号无效');
  if(p.exams!==undefined&&(!Array.isArray(p.exams)||c.exams.length!==p.exams.length))throw Error('试卷格式无效');
  for(const e of c.exams){
    if(!['GS','XD','CY','GL'].includes(e.tk)||!stamp(e.score)||!stamp(e.total)||!stamp(e.right||0)||!stamp(e.pending||0))throw Error('试卷分数或科目无效');
    if(e.updatedAt!==undefined&&!stamp(e.updatedAt))throw Error('试卷更新时间无效');
  }
  for(const key of ['events','drafts','prefs','feedback'])if(p[key]!==undefined&&(!validObject(p[key])||Object.keys(c[key]).length!==Object.keys(p[key]).length))throw Error(key+' 字段无效，未导入');
  if(p.schema!==undefined&&(!Number.isInteger(p.schema)||p.schema>4))throw Error('学习数据版本较新，请先升级应用');
  if(p.favT!==undefined&&!stamp(p.favT))throw Error('收藏时间无效');return c;
}
function parseBackup(data) {
  if(!validObject(data))throw Error('文件必须是题库 JSON 备份');const accounts={};
  if(data.format==='mathbank-backup') {
    if(![2,3].includes(data.version)||!validObject(data.accounts))throw Error('不支持的备份版本');
    for(const [id,p]of Object.entries(data.accounts)){if(!safeId(id))throw Error('账号编号无效');accounts[id]=validateImport(p);}
  } else {
    const groups={},fields={REC:'rec',FAV:'fav',EXAMS:'exams',EXDEL:'exdel',RECDEL:'recdel',FAVT:'favT',STATE:'state',DRAFT:'draft'};
    for(const [key,value]of Object.entries(data)){
      const m=key.match(/^NEU-(STATE|REC|FAV|EXAMS|EXDEL|RECDEL|FAVT|DRAFT):([A-Za-z0-9_-]+)$/);if(!m)continue;
      if(!safeId(m[2]))throw Error('账号编号无效');
      (groups[m[2]]??={})[fields[m[1]]]=typeof value==='string'?JSON.parse(value):value;
    }
    for(const [id,p]of Object.entries(groups)){const merged=validateImport(p.state||p);if(p.draft){if(!LearningCore.validDraft(p.draft))throw Error('旧版草稿无效');merged.drafts[p.draft.id]=p.draft}accounts[id]=merged;}
  }
  if(!Object.keys(accounts).length)throw Error('未发现可导入的学习记录');return accounts;
}
let _pendingImport=null;
async function importOldData(file) {
  const msg=document.getElementById('imp-msg');
  try {
    if(file.size>30*1024*1024)throw Error('文件超过 30 MB，请核对是否为题库备份');
    _pendingImport=parseBackup(JSON.parse(await file.text()));
    const select=document.getElementById('import-account');select.replaceChildren();
    for(const [id,p]of Object.entries(_pendingImport)){
      const option=document.createElement('option');option.value=id;option.textContent=id+'（作答 '+Object.keys(p.rec).length+'，收藏 '+p.fav.length+'，试卷 '+p.exams.length+'）';select.appendChild(option);
    }
    document.getElementById('import-confirm').hidden=false;msg.textContent='校验通过，请选择来源账号并确认合并到当前账号。';
  }catch(e){_pendingImport=null;document.getElementById('import-confirm').hidden=true;msg.textContent='未导入：'+e.message;}
}
function applyImportedState(incoming) {
  const before=JSON.parse(JSON.stringify(snapshot())),merged=mergeState(before,validateImport(incoming));
  localStorage.setItem('mb_before_import:'+_ukey,JSON.stringify(before));
  localStorage.setItem('NEU-STATE:'+_ukey,JSON.stringify(merged));
  try {assignState(merged);if(!saveLocal())throw Error('本地存储不可用');scheduleSync();}
  catch(error){assignState(cleanState(before));try{localStorage.setItem('NEU-STATE:'+_ukey,JSON.stringify(before));}catch{}throw error;}
}
function confirmImport() {
  const p=_pendingImport?.[document.getElementById('import-account').value];if(!p)return;
  try {applyImportedState(p);_pendingImport=null;document.getElementById('import-confirm').hidden=true;document.getElementById('imp-msg').textContent='已合并到当前账号。原有记录已保留，可导出备份。';renderCourses();}
  catch(e){document.getElementById('imp-msg').textContent='导入失败，原记录未变：'+e.message;}
}
function restoreBeforeImport() {
  const p=_read('mb_before_import:'+_ukey,null);if(!p){toast('暂无导入前的备份');return;}
  downloadJSON('数学题库-导入前备份.json',{format:'mathbank-backup',version:2,accounts:{[_ukey]:p}});
}
function importLocalLegacy() {
  if(_ukey===LOCAL_UID){toast('当前已经在使用本机记录');return;}
  if(!confirm('将这台设备的离线／旧版记录合并到当前账号？建议先导出备份。'))return;
  try {applyImportedState(_read('NEU-STATE:'+LOCAL_UID,null)||legacyState(LOCAL_UID));toast('已合并本机记录');}catch(e){toast('合并失败，原记录未变');}
}
function restoreFavSeed() {
  if(_seedRestored||_read('mb_seed:'+_ukey,false)){toast('此账号已恢复过旧收藏，不会重复添加');return;}
  if(!confirm('恢复内置旧收藏清单？此操作仅执行一次，现有收藏会保留。'))return;
  const prev=fav.slice(),ops={...favOps},time=_favLocalT;
  fav=[...new Set([...fav,...(window.FAV_SEED||[])])];touchFav();
  if(!saveLocal()){fav=prev;favOps=ops;_favLocalT=time;return;}
  localStorage.setItem('mb_seed:'+_ukey,'true');saveLocal();scheduleSync();toast('旧收藏已恢复；无法匹配的编号会保留并提示');
}
