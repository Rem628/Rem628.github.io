window.MB_VER = "20261031a";

/* ---------- 全局错误显示（诊断用）：任何脚本错误都显示在页面顶部 ---------- */
function showFatal(m) {
  try {
    let el = document.getElementById("fatal-err");
    if (!el) {
      el = document.createElement("div");
      el.id = "fatal-err";
      el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#ffe5e0;color:#8f1f11;font-size:12px;padding:10px 14px;white-space:pre-wrap;word-break:break-all;font-family:monospace";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent += m + "\n";
  } catch (e) {}
}
window.addEventListener("error", (e) => showFatal("脚本错误: " + e.message + " @" + String(e.filename || "").split("/").pop() + ":" + e.lineno));
window.addEventListener("unhandledrejection", (e) => showFatal("异步错误: " + ((e.reason && e.reason.message) || e.reason)));
/* =========================================================
   大学数学题库 · 在线版
   存储层：云数据库（跨设备同步）+ localStorage（本地缓存/离线兜底）
   ========================================================= */

/* ---------- 云配置（来自 publicConfig，可安全置于前端） ---------- */
/* ---------- Supabase 配置（免费层自建后端） ----------
   使用前填入你自己的 Supabase 项目信息（Settings → API）：
   url     → Project URL（如 https://xxxx.supabase.co）
   anonKey → anon public key
   email/password → Authentication → Users 里创建的单人账号 */
const SUPA_CFG = {
  url: "https://pgpaegrihdhynevpyfes.supabase.co",
  anonKey: "sb_publishable_pD0k8jn6vDbZK4DYEaFesA_Qi5jwEdD",
  email: "2974675585@qq.com",
  password: "zjr640210",
};

let supa = null;
function initCloud() {
  if (supa) return supa;
  if (!SUPA_CFG.url || !SUPA_CFG.anonKey) {
    throw new Error("Supabase 未配置：请在 app.js 顶部 SUPA_CFG 填入 url 与 anonKey");
  }
  if (typeof supabase === "undefined") {
    throw new Error("supabase-js 未加载成功，请刷新页面或检查网络");
  }
  supa = supabase.createClient(SUPA_CFG.url, SUPA_CFG.anonKey);
  return supa;
}

/* ---------- 轻量提示 ---------- */
let _toastT;
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove("show"), 2800);
}

/* 版本自检：每次启动问服务器要最新版本号（带时间戳绕开一切缓存），
   和本机记录不一致就清空全部缓存并刷新——解决「改版后用户端一直拿旧缓存」的问题 */
async function checkUpdate() {
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return false;
    const v = (await r.json()).v;
    if (!v) return false;
    if (localStorage.getItem("mb_ver") === v) return false;
    localStorage.setItem("mb_ver", v);
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    location.reload();
    return true;
  } catch (e) { return false; }
}

/* ---------- 会话 ---------- */
/* 无云模式：云端不可用（额度停用/离线）时，自动降级为纯本机运行，
   以原账号 ID 读写本地缓存，收藏/作答/试卷数据无缝衔接不丢失 */
const LOCAL_UID = "2109519881526317056";
let CLOUD_DOWN = false;
async function getSession() {
  if (CLOUD_DOWN) return { user: { id: LOCAL_UID } };
  try {
    initCloud();
    let { data } = await supa.auth.getSession();
    if (!data || !data.session) {
      // 固定单人账号自动登录；账号不存在时自动注册
      let sess = null, err = null;
      const resp = await supa.auth.signInWithPassword({ email: SUPA_CFG.email, password: SUPA_CFG.password });
      sess = resp.data; err = resp.error;
      if (err || !sess || !sess.session) {
        const r3 = await supa.auth.signUp({ email: SUPA_CFG.email, password: SUPA_CFG.password });
        sess = r3.data; err = r3.error;
      }
      if (err || !sess || !sess.session) throw new Error((err && err.message) || "登录失败");
      ({ data } = await supa.auth.getSession());
    }
    if (!data || !data.session || !data.session.user) return null;
    return { user: data.session.user };
  } catch (e) {
    CLOUD_DOWN = true;
    setSyncLabel("离线模式：仅保存在本机（" + String(e.message || e).slice(0, 50) + "）");
    return { user: { id: LOCAL_UID } };
  }
}
async function requireLogin() {
  const s = await getSession();
  if (!s) {
    location.href = "index.html";
    return null;
  }
  return s;
}

/* ---------- 本地缓存（按账号隔离） ----------
   同一台设备换账号登录时，必须各自用自己的缓存，
   否则上一个账号的答题记录会被下一个账号看到、甚至被同步进对方的云端。 */
function _read(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
let rec = {}, fav = [];
let exams = [];          // 模拟练习的历史试卷（回看试卷）
let _cloudExams = [];    // 最近一次从云端拉到的 exams，推送时做合并基准
let exDel = {};          // 已删除试卷的墓碑标记 {examId: 删除时间}，防止删除后被云端合并复活
let recDel = {};         // 已重置作答的墓碑标记 {qid: 重置时间}，防止重置后被云端合并复活
let _ukey = "";
function userKey(s) {
  const u = (s && s.user) || {};
  // 会话里稳定存在的是 id（= auth 的 sub）；email 在 user.raw.email，且可能为空
  const raw = u.id || u.sub || u.email || u.phone || "anon";
  return String(raw).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

/* 一次性迁移：WorkBuddy 云停用前的本机数据（旧账号 key）搬到新后端的账号 key 下。
   只在「新 key 尚未初始化 且 旧 key 有数据」时执行一次，绝不覆盖新数据。 */
function migrateOldLocalData(newKey) {
  try {
    const oldKey = "2109519881526317056";
    if (newKey === oldKey) return;
    if (localStorage.getItem("NEU-REC:" + newKey) !== null) return;
    if (localStorage.getItem("NEU-REC:" + oldKey) === null) return;
    ["NEU-REC:", "NEU-FAV:", "NEU-EXAMS:", "NEU-EXDEL:", "NEU-RECDEL:", "NEU-FAVT:"].forEach((p) => {
      const v = localStorage.getItem(p + oldKey);
      if (v !== null) localStorage.setItem(p + newKey, v);
    });
    console.log("[数据迁移] 本机收藏/作答/试卷已迁移到新账号存储");
  } catch (e) {}
}
function loadForUser(s) {
  const k = userKey(s);
  if (k === _ukey) return;              // 同一账号重复登录，保留现有内存数据
  _ukey = k;
  rec = _read("NEU-REC:" + k, {});
  fav = _read("NEU-FAV:" + k, []);
  if (!Array.isArray(fav)) fav = [];
  exams = _read("NEU-EXAMS:" + k, []);
  if (!Array.isArray(exams)) exams = [];
  exDel = _read("NEU-EXDEL:" + k, {}) || {};
  recDel = _read("NEU-RECDEL:" + k, {}) || {};
  _favLocalT = _read("NEU-FAVT:" + k, 0) || 0;
  saveLocal();
}
function saveLocal() {
  if (!_ukey) return;
  try {
    localStorage.setItem("NEU-REC:" + _ukey, JSON.stringify(rec));
    localStorage.setItem("NEU-FAV:" + _ukey, JSON.stringify(fav));
    localStorage.setItem("NEU-EXAMS:" + _ukey, JSON.stringify(exams));
    localStorage.setItem("NEU-EXDEL:" + _ukey, JSON.stringify(exDel));
    localStorage.setItem("NEU-RECDEL:" + _ukey, JSON.stringify(recDel));
  } catch (e) {}
}
/* 删除一份试卷记录：本地移除 + 打删除标记（同步时云端那份也不会复活） */
function deleteExam(id) {
  exams = exams.filter((e) => e.id !== id);
  exDel[id] = Date.now();
  saveLocal();
  syncExams();
}
/* 模拟练习试卷合并：按 id 去重，冲突取时间新的一方 */
function mergeExams(a, b) {
  const m = {};
  (a || []).concat(b || []).forEach((e) => {
    if (e && e.id && (!m[e.id] || (e.ts || 0) > (m[e.id].ts || 0))) m[e.id] = e;
  });
  return Object.values(m).sort((x, y) => (y.ts || 0) - (x.ts || 0));
}
/* 收藏在本机最后一次变动的时间：云端合并时用它判断「谁新听谁的」 */
let _favLocalT = 0;
function touchFav() {
  _favLocalT = Date.now();
  if (_ukey) { try { localStorage.setItem("NEU-FAVT:" + _ukey, String(_favLocalT)); } catch (e) {} }
}
function recAns(id) { const v = rec[id]; return v && typeof v === "object" ? v.a : v; }
function recTime(id) { const v = rec[id]; return v && typeof v === "object" ? v.t || 0 : 0; }
function isFav(qid) { return fav.indexOf(qid) >= 0; }

/* ---------- 云端同步 ---------- */
let _syncT = null, _syncing = false;
function setSyncLabel(text) {
  const el = document.getElementById("syncstate");
  if (el) el.textContent = text;
}
async function pullState() {
  if (CLOUD_DOWN) { setSyncLabel("离线模式：仅保存在本机"); return true; }
  initCloud();
  const { data, error } = await supa.from("user_state").select("payload").maybeSingle();
  if (error) { setSyncLabel("读取云端进度失败"); return false; }
  if (!data || !data.payload) {
    setSyncLabel("云端暂无进度");
    await pushState();              // 首次使用：把本地已有的进度推上去
    return false;
  }
  const p = data.payload;
  const cloudT = p.ts || 0;
  // 作答记录：按作答时间合并，两边都不丢；
  // 但「已被重置删除」的记录（墓碑时间晚于其作答时间）绝不复活
  const remote = p.rec || {};
  let changed = false;
  for (const qid in remote) {
    const r = remote[qid];
    if (recDel[qid] && recDel[qid] > (r && r.t ? r.t : 0)) continue;
    if (!rec[qid] || recTime(qid) <= (r && r.t ? r.t : 0)) { rec[qid] = r; changed = true; }
  }
  // 收藏：谁最后修改听谁的。之前是「取并集」，取消收藏永远同步不上去（拉回来又复活了）
  if (cloudT > _favLocalT) {
    const rf = Array.isArray(p.fav) ? p.fav : [];
    const before = fav.length;
    fav = Array.from(new Set(rf));
    if (fav.length !== before) changed = true;
    _favLocalT = cloudT;
    if (_ukey) { try { localStorage.setItem("NEU-FAVT:" + _ukey, String(_favLocalT)); } catch (e) {} }
  }
  if (changed) saveLocal();
  // 模拟练习试卷：与云端合并；删除过的试卷带墓碑标记，不会被云端拉回来
  for (const id in (p.exdel || {})) {
    exDel[id] = Math.max(exDel[id] || 0, p.exdel[id]);
  }
  const isDel = (e) => exDel[e.id] && exDel[e.id] > (e.ts || 0);
  _cloudExams = (Array.isArray(p.exams) ? p.exams : []).filter((e) => !isDel(e));
  const beforeEx = exams.length;
  exams = mergeExams(exams.filter((e) => !isDel(e)), _cloudExams);
  if (exams.length !== beforeEx) saveLocal();
  // 本机的收藏比云端新（刚取消/新增还没推送）→ 立刻推上去，别等下次
  if (_favLocalT > cloudT) { await pushState(); return true; }
  setSyncLabel("已同步");
  return true;
}
async function pushState() {
  if (CLOUD_DOWN) { setSyncLabel("离线模式：仅保存在本机"); return; }
  initCloud();
  const s = await getSession();
  if (!s) { setSyncLabel("未登录，未保存"); return; }
  let correct = 0;
  for (const qid in rec) {
    const q = (window.QDATA || {})[qid];
    if (q && recAns(qid) === q.a) correct++;
  }
  const payload = {
    rec, fav,
    answered: Object.keys(rec).length,
    correct, favs: fav.length, ts: Date.now(),
    exams: mergeExams(exams, (_cloudExams || []).filter((e) => !(exDel[e.id] && exDel[e.id] > (e.ts || 0)))),
    exdel: exDel,    // 删除标记随卷同步，其他设备也不会把已删的并回来
    recdel: recDel,  // 重置墓碑：早于重置时间的云端作答不再合并回来
  };
  const { error } = await supa
    .from("user_state")
    .upsert({ payload, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
  setSyncLabel(error ? "保存失败，将重试" : "已同步");
}
function scheduleSync() {
  clearTimeout(_syncT);
  setSyncLabel("待保存…");
  _syncT = setTimeout(async () => {
    if (_syncing) { scheduleSync(); return; }   // 上一次还没推完：重新排队，绝不丢任务
    _syncing = true;
    try { await pushState(); } catch (e) { setSyncLabel("保存失败"); }
    _syncing = false;
  }, 600);
}
/* 页面即将关闭/切后台：把还没推出去的变更立刻推走，避免「改完马上刷新」丢操作 */
function flushSync() {
  if (!_syncT) return;
  clearTimeout(_syncT);
  _syncT = null;
  if (_syncing) return;
  _syncing = true;
  Promise.resolve(pushState()).finally(() => { _syncing = false; });
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSync();
});
window.addEventListener("pagehide", flushSync);

/* 试卷同步：读改写 payload（整行覆盖），缺失字段用本机补齐防清空 */
async function syncExams() {
  try {
    initCloud();
    const { data } = await supa.from("user_state").select("payload").maybeSingle();
    const p = (data && data.payload) || { rec: rec || {}, fav: fav || [] };
    if (!p.rec) p.rec = rec || {};
    if (!p.fav) p.fav = fav || [];
    const isDel = (e) => exDel[e.id] && exDel[e.id] > (e.ts || 0);
    p.exams = mergeExams(exams, (_cloudExams || []).filter((e) => !isDel(e)));
    p.exdel = exDel;
    p.updated_at = new Date().toISOString();
    const { error } = await supa
      .from("user_state")
      .upsert({ payload: p, updated_at: p.updated_at }, { onConflict: "owner_id" });
    setSyncLabel(error ? "同步失败" : "已同步");
  } catch (e) { setSyncLabel("同步失败"); }
}

/* 手动刷新：先推本地变更，再拉云端合并，最后重画当前页 */
async function manualRefresh(btn) {
  if (btn) btn.disabled = true;
  setSyncLabel("刷新中…");
  try {
    if (window.QDATA && Object.keys(window.QDATA).length) await pushState();
    await pullState();
    if (typeof renderChapter === "function") renderChapter();
    if (typeof renderFav === "function") renderFav();
    if (typeof renderCourses === "function") renderCourses();
    // 模拟练习页不能 paintAll（会把刷题历史画进试卷），只排版公式
    if (typeof state !== "undefined" && state && state.exam) typesetMath(document.body);
    else paintAll();
    syncFavBtns();
    applyFilters();
    setSyncLabel("已同步");
    toast("已刷新");
  } catch (e) {
    setSyncLabel("刷新失败，请稍后再试");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- 题目渲染 ----------
   高数/线代是图片题，C语言是纯文本题：用 isImg() 判断，二者共用一套 DOM。 */
function esc(s) { return String(s == null ? "" : s).replace(/"/g, "&quot;"); }
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function isImg(u) { return /^(img\/|https?:|\.\/)/.test(String(u || "")); }
function bodyHtml(u, alt) {
  return isImg(u)
    ? '<img src="' + u + '" loading="lazy" alt="' + alt + '" onerror="imgFail(this)">'
    : '<div class="txt">' + escHtml(u) + "</div>";
}
/* 填空判分用的文本归一：去掉空白与中英文标点后比较，避免「对，」「对.」这类误差 */
function normTxt(s) {
  return String(s == null ? "" : s)
    .replace(/[\s\u3000]/g, "")
    .replace(/[，,。.、;；:：""''（）()《》<>！!？?—\-_]/g, "")
    .toLowerCase();
}
function qType(q) {
  return q.t === "multi" ? "multi"
    : (q.t === "blank" ? "blank"
      : (q.t === "calc" ? "calc" : "single"));
}
/* LaTeX 公式排版：页面里有公式才去加载 MathJax（约 1MB，按需） */
let _mjLoading = false;
function typesetMath(el) {
  if (!window.MathJax) {
    if (_mjLoading) return;
    _mjLoading = true;
    window.MathJax = window.MathJax || {
      tex: { inlineMath: [["\\(", "\\)"]] },
      startup: { typeset: false },
    };
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";
    s.onload = () => {
      (window.MathJax.startup.promise || Promise.resolve()).then(() => {
        _mjLoading = false;
        typesetMath(el);
      });
    };
    s.onerror = () => {
      _mjLoading = false;
      // CDN 偶发不稳，自动重试一次
      if (!typesetMath._retried) {
        typesetMath._retried = true;
        setTimeout(() => typesetMath(el), 1200);
      }
    };
    document.head.appendChild(s);
    return;
  }
  const run = () => {
    try { MathJax.typesetPromise(el ? [el] : undefined).catch(() => {}); } catch (e) {}
  };
  if (window.MathJax.startup && window.MathJax.startup.promise) run();
  else setTimeout(run, 400);
}

function qHTML(q, i, prefix) {
  if (!q) return "";
  const L = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const type = qType(q);
  let workArea = "";
  if (type === "calc") {
    // 解答题（线代填空/计算）：答案无法自动判分，先自己算再看解析，自评
    const stemHtml = String(q.s || "").replace(/⟪BLANK⟫/g, '<span class="blank-slot"></span>');
    workArea = '<div class="stem calc-stem">' + stemHtml + "</div>"
      + '<div class="self-eval"><span class="hint-inline">先自己算，再对照解析：</span>'
      + '<button class="btn" onclick="selfAssess(this,true)">✓ 答对了</button>'
      + '<button class="btn" onclick="selfAssess(this,false)">✗ 没答出来</button></div>';
  } else {
    let opts = "";
    if (type === "blank") {
      opts = '<div class="blank-box">'
        + '<input type="text" class="blank-in" placeholder="输入答案后点「核对」" autocomplete="off">'
        + '<button class="btn" onclick="checkBlank(this)">核对</button></div>';
    } else {
      const inp = type === "multi" ? "checkbox" : "radio";
      for (let k = 1; k <= 8; k++) {
        const v = L[k - 1];
        if (!q.o || !q.o[String(k)]) continue;
        opts += '<label class="opt" data-v="' + v + '">'
          + '<input type="' + inp + '" name="' + prefix + "-" + i + '" value="' + v + '">'
          + '<span class="lbl">' + v + "</span>"
          + bodyHtml(q.o[String(k)], "选项" + v) + "</label>";
      }
      if (type === "multi") {
        opts += '<div class="multi-submit">'
          + '<button class="btn primary" onclick="submitMulti(this)">确认作答</button>'
          + '<span class="hint-inline">多选题，选完再确认</span></div>';
      }
    }
    workArea = '<div class="stem">' + bodyHtml(q.s, "题干") + "</div>"
      + '<div class="opts">' + opts + "</div>";
  }
  let why;
  if (q.eh) why = '<div class="txt why-txt">' + q.eh + "</div>";      // 已排版的解析 HTML
  else if (q.et) why = '<div class="txt why-txt">' + escHtml(q.et) + "</div>";
  else if (q.w) why = bodyHtml(q.w, "答案解析");
  else why = '<span class="hint">（该题无解析）</span>';
  // 文本题把题干也放进搜索索引，这样在本章内搜关键词能搜到题目
  const plainStem = type === "calc" ? String(q.s || "").replace(/<[^>]+>/g, " ") : (q.s && !isImg(q.s) ? q.s : "");
  const searchTxt = ((q.ch || "") + " " + (q.kp || "") + " " + plainStem).toLowerCase();
  let tag = "";
  if (q.tag) tag = '<span class="qtype calc">' + escHtml(q.tag) + "</span>";
  else if (type === "multi") tag = '<span class="qtype multi">多选</span>';
  else if (type === "blank") tag = '<span class="qtype blank">填空</span>';
  // 有些章节的知识点名和章节名相同，这时只显示一个，避免出现「A · A」
  const metaTxt = (q.kp && q.ch && q.kp !== q.ch) ? (q.kp + " · " + q.ch) : (q.kp || q.ch || "");
  return '<div class="q" data-qid="' + q.q + '" data-ans="' + esc(q.a) + '" data-txt="'
    + esc(searchTxt) + '" data-type="' + type + '">'
    + '<div class="qh"><span class="no">第 ' + i + " 题</span>" + tag
    + '<span class="meta">' + esc(metaTxt) + "</span>"
    + '<button class="fav-btn" data-qid="' + q.q + '" onclick="toggleFav(this)" title="收藏">'
    + (isFav(q.q) ? "★" : "☆") + "</button></div>"
    + workArea
    + '<div class="fb"></div>'
    + '<div class="peek"><button onclick="peek(this)">查看答案解析</button></div>'
    + '<div class="why">' + why + "</div></div>";
}

/* ---------- 图片加载诊断 ----------
   服务端已抽查确认图片全部可用；个别设备整页图片空白，
   多半是浏览器开了「无图/省流模式」或被广告拦截插件拦截，给出明确提示。 */
let _imgFailN = 0, _imgWarned = false;
function imgFail(el) {
  // 弱网下偶发加载失败：先自动带时间戳重试一次，再失败才提示
  if (!el.dataset.retry) {
    el.dataset.retry = "1";
    el.src = el.src.split("?")[0] + "?r=" + Date.now();
    return;
  }
  _imgFailN++;
  const ph = document.createElement("div");
  ph.className = "img-missing";
  ph.textContent = "图片加载失败";
  el.replaceWith(ph);
  if (_imgFailN >= 3 && !_imgWarned) { _imgWarned = true; showImgHelp(); }
}
function showImgHelp() {
  if (document.getElementById("imghelp")) return;
  const wrap = document.querySelector(".wrap");
  if (!wrap) return;
  const d = document.createElement("div");
  d.className = "banner err";
  d.id = "imghelp";
  d.innerHTML = "检测到多张图片加载失败。经服务端抽查，本站图片本身是正常的，"
    + "这通常是你使用的浏览器开启了<b>「无图模式 / 省流模式」</b>，或被广告拦截功能拦截。"
    + "请在浏览器设置里关闭无图/省流模式，或改用 Chrome / Edge / Safari 等浏览器打开。"
    + ' <a href="#" onclick="location.reload();return false">重试</a>';
  wrap.insertBefore(d, wrap.firstChild);
}

/* ---------- 筛选状态 ---------- */
const f = { kp: null, wrong: false, kw: "", fav: false };
function isWrong(q) {
  const id = q.getAttribute("data-qid");
  return !!rec[id] && recAns(id) !== q.getAttribute("data-ans");
}
function visibleQs() {
  return Array.prototype.slice.call(document.querySelectorAll(".q"))
    .filter((q) => q.style.display !== "none");
}
function applyFilters() {
  document.querySelectorAll(".q").forEach((q) => {
    const blk = q.closest(".kp-block");
    const okKp = !f.kp || (blk && blk.getAttribute("data-kp") === f.kp) || (f.kp && !blk);
    const okW = !f.wrong || isWrong(q);
    const okKw = !f.kw || (q.getAttribute("data-txt") || "").indexOf(f.kw) >= 0;
    const okFav = !f.fav || isFav(q.getAttribute("data-qid"));
    q.style.display = okKp && okW && okKw && okFav ? "" : "none";
  });
  document.querySelectorAll(".kp-block").forEach((b) => {
    const any = Array.prototype.some.call(b.querySelectorAll(".q"), (q) => q.style.display !== "none");
    b.style.display = any ? "" : "none";
  });
  const em = document.getElementById("empty");
  if (em) em.style.display = visibleQs().length ? "none" : "block";
  updateGroupStats();
  updateScore();
}
function updateGroupStats() {
  document.querySelectorAll(".gbtn").forEach((b) => {
    const id = b.getAttribute("data-kp");
    if (id === "__all__") return;
    const blk = document.querySelector('.kp-block[data-kp="' + id + '"]');
    if (!blk) return;
    const qs = blk.querySelectorAll(".q");
    let done = 0;
    qs.forEach((q) => { if (rec[q.getAttribute("data-qid")]) done++; });
    const n = b.querySelector(".n");
    if (n) n.textContent = done + "/" + qs.length;
  });
}
function updateScore() {
  const qs = visibleQs();
  let done = 0, ok = 0;
  qs.forEach((q) => {
    const id = q.getAttribute("data-qid");
    if (rec[id]) { done++; if (recAns(id) === q.getAttribute("data-ans")) ok++; }
  });
  const el = document.getElementById("score");
  if (!el) return;
  const pct = done ? Math.round((ok * 100) / done) : 0;
  el.innerHTML = "已答 <b>" + done + "</b>/" + qs.length + "　正确率 <b>" + pct + "%</b>";
}

/* ---------- 作答 ---------- */
function markResult(q, ok, ans) {
  const fb = q.querySelector(".fb");
  if (fb) {
    fb.className = "fb " + (ok ? "ok" : "no");
    fb.innerHTML = ok ? "✓ 回答正确" : "✗ 回答错误，正确答案：" + escHtml(ans);
  }
  const why = q.querySelector(".why");
  if (why) why.classList.add("show");
}
function paintAnswered(q, v) {
  const ans = q.getAttribute("data-ans") || "";
  const type = q.getAttribute("data-type") || "single";

  if (type === "blank") {
    const inp = q.querySelector(".blank-in");
    if (inp) { inp.value = v; inp.disabled = true; }
    const b = q.querySelector(".blank-box .btn");
    if (b) b.disabled = true;
    q.querySelectorAll(".opt").forEach((o) => o.classList.add("locked"));
    markResult(q, normTxt(v) === normTxt(ans), ans);
    return;
  }

  if (type === "multi") {
    String(v).split("").forEach((c) => {
      const el = q.querySelector('.opt[data-v="' + c + '"]');
      if (!el) return;
      el.classList.add(ans.indexOf(c) >= 0 ? "right" : "wrong");
      const i = el.querySelector("input");
      if (i) i.checked = true;
    });
    // 漏选的正确项用虚线框标出来，让人知道当时少选了哪个
    String(ans).split("").forEach((c) => {
      if (String(v).indexOf(c) < 0) {
        const el = q.querySelector('.opt[data-v="' + c + '"]');
        if (el) el.classList.add("right", "missed");
      }
    });
    q.querySelectorAll("input").forEach((i) => { i.disabled = true; });
    q.querySelectorAll(".opt").forEach((o) => o.classList.add("locked"));
    const b = q.querySelector(".multi-submit .btn");
    if (b) b.disabled = true;
    markResult(q, v === ans, ans);
    return;
  }

  if (type === "calc") {
    const ok = v === "ok";
    q.querySelectorAll(".self-eval .btn").forEach((b, idx) => {
      b.disabled = true;
      if ((idx === 0) === ok) b.classList.add(ok ? "self-ok" : "self-no");
    });
    const fb = q.querySelector(".fb");
    if (fb) {
      fb.className = "fb " + (ok ? "ok" : "no");
      fb.textContent = ok ? "✓ 自评：已掌握" : "✗ 自评：还没掌握，看解析再练一遍";
    }
    const why = q.querySelector(".why");
    if (why) why.classList.add("show");
    return;
  }

  const chosen = q.querySelector('.opt[data-v="' + v + '"]');
  if (chosen) chosen.classList.add(v === ans ? "right" : "wrong");
  if (v !== ans) {
    const right = q.querySelector('.opt[data-v="' + ans + '"]');
    if (right) right.classList.add("right");
  }
  q.querySelectorAll("input").forEach((i) => { i.disabled = true; });
  q.querySelectorAll(".opt").forEach((o) => o.classList.add("locked"));
  markResult(q, v === ans, ans);
}
/* 多选：勾选完点「确认作答」才判分 */
function submitMulti(btn) {
  const q = btn.closest(".q");
  if (!q) return;
  const picked = [];
  q.querySelectorAll('input[type=checkbox]').forEach((b) => { if (b.checked) picked.push(b.value); });
  if (!picked.length) { toast("至少选一个选项"); return; }
  const val = picked.sort().join("");
  rec[q.getAttribute("data-qid")] = { a: val, t: Date.now() };
  saveLocal();
  paintAnswered(q, val);
  applyFilters();
  scheduleSync();
}
/* 填空：写下答案后点「核对」，按归一化文本判分 */
function checkBlank(btn) {
  const q = btn.closest(".q");
  if (!q) return;
  const inp = q.querySelector(".blank-in");
  const val = inp ? inp.value.trim() : "";
  if (!val) { toast("先写个答案再核对"); return; }
  rec[q.getAttribute("data-qid")] = { a: val, t: Date.now() };
  saveLocal();
  paintAnswered(q, val);
  applyFilters();
  scheduleSync();
}
/* 重新渲染会清掉所有作答标记，所以每次渲染后都要回扫一遍，
   把 rec 里已有记录的题目重新标成「已答」（绿/红 + 锁死选项 + 显示解析）。
   放在 bootPage 里统一做，避免某个页面的 render 函数漏掉这一步。 */
function paintAll() {
  document.querySelectorAll(".q").forEach((q) => {
    const id = q.getAttribute("data-qid");
    if (rec[id]) paintAnswered(q, recAns(id));
  });
  typesetMath(document.body);   // 页面里有 LaTeX 公式（线代填空/计算）时排版
}

/* 解答题自评：数学填空/计算无法自动判分，按「会/不会」记录，照样进进度和错题本 */
function selfAssess(btn, ok) {
  // 模拟练习页：自评结果记入试卷（exam.ans），不写入刷题记录
  if (typeof state !== "undefined" && state && state.exam && typeof examSelf === "function") {
    examSelf(btn, ok);
    return;
  }
  const q = btn.closest(".q");
  if (!q) return;
  rec[q.getAttribute("data-qid")] = { a: ok ? "ok" : "no", t: Date.now() };
  saveLocal();
  paintAnswered(q, ok ? "ok" : "no");
  applyFilters();
  scheduleSync();
}

function toggleFav(btn) {
  const qid = btn.getAttribute("data-qid");
  const i = fav.indexOf(qid);
  if (i >= 0) fav.splice(i, 1); else fav.push(qid);
  touchFav();
  saveLocal();
  syncFavBtns();
  applyFilters();
  scheduleSync();
}
function syncFavBtns() {
  document.querySelectorAll(".fav-btn").forEach((b) => {
    const on = isFav(b.getAttribute("data-qid"));
    b.classList.toggle("on", on);
    b.textContent = on ? "★" : "☆";
    b.title = on ? "取消收藏" : "收藏本题";
  });
}
function peek(btn) {
  btn.closest(".q").querySelector(".why").classList.toggle("show");
}
function toggleFavFilter(btn) {
  f.fav = !f.fav;
  btn.classList.toggle("on", f.fav);
  btn.textContent = f.fav ? "显示全部" : "只看收藏";
  applyFilters();
}
function toggleWrong(btn) {
  f.wrong = !f.wrong;
  btn.classList.toggle("on", f.wrong);
  btn.textContent = f.wrong ? "显示全部" : "只看错题";
  applyFilters();
}
let cram = false;
function toggleCram(btn) {
  cram = !cram;
  btn.classList.toggle("on", cram);
  btn.textContent = cram ? "返回答题模式" : "背题模式";
  document.querySelectorAll(".q").forEach((q) => {
    const ans = q.getAttribute("data-ans"), id = q.getAttribute("data-qid");
    if (cram) {
      // 多选答案是 "ABD" 这样的串，要逐项标绿
      if (q.getAttribute("data-type") === "multi") {
        String(ans).split("").forEach((c) => {
          const el = q.querySelector('.opt[data-v="' + c + '"]');
          if (el) el.classList.add("right");
        });
      } else {
        const right = q.querySelector('.opt[data-v="' + ans + '"]');
        if (right) right.classList.add("right");
      }
      const fb = q.querySelector(".fb");
      fb.className = "fb ok";
      fb.textContent = q.getAttribute("data-type") === "calc"
        ? "解答题 · 答案解析在下方" : "答案 " + ans;
      q.querySelector(".why").classList.add("show");
      q.querySelectorAll("input").forEach((i) => { i.disabled = true; });
      q.querySelectorAll(".opt").forEach((o) => o.classList.add("locked"));
    } else {
      q.querySelectorAll(".opt").forEach((o) => o.classList.remove("right", "wrong", "locked"));
      q.querySelectorAll("input").forEach((i) => { i.disabled = false; });
      const fb = q.querySelector(".fb");
      fb.className = "fb"; fb.innerHTML = "";
      q.querySelector(".why").classList.remove("show");
      if (rec[id]) paintAnswered(q, recAns(id));
    }
  });
  updateScore();
}
async function resetAll() {
  const qs = visibleQs();
  if (!qs.length) { toast("当前没有显示任何题目，无可重置的记录。"); return; }
  if (!confirm("确定清空当前显示的这 " + qs.length + " 道题的作答记录吗？\n\n· 被筛选隐藏的题目不受影响\n· 收藏不会被清除")) return;
  // 删除本地作答并打重置墓碑（pullState 合并时，早于墓碑时间的云端旧作答不再复活）
  qs.forEach((q) => {
    const id = q.getAttribute("data-qid");
    delete rec[id];
    recDel[id] = Date.now();
  });
  saveLocal();
  // 旧版这里 scheduleSync() 之后立刻 reload，600ms 的推送定时器永远没机会执行，
  // 重置结果从未上云 → 刷新后被云端旧记录全部合并回来。现在必须等推送完成再刷新。
  toast("正在重置并同步…");
  try { await pushState(); } catch (e) {}
  location.reload();
}

/* ---------- 定位 ---------- */
function qLabel(q) {
  const no = q ? q.querySelector(".no") : null;
  return no ? no.textContent.trim() : "该题";
}
function scrollToQ(t) {
  const hdr = document.querySelector("header");
  const off = hdr ? hdr.offsetHeight : 0;
  const y = t.getBoundingClientRect().top + window.pageYOffset - off - 14;
  window.scrollTo(0, y < 0 ? 0 : y);
}
function jumpToLatest(quiet) {
  const qs = visibleQs();
  if (!qs.length) return;
  let lastT = -1, lastIdx = -1, answeredIdx = -1, target;
  for (let i = 0; i < qs.length; i++) {
    const id = qs[i].getAttribute("data-qid");
    if (!rec[id]) continue;
    answeredIdx = i;
    const t = recTime(id);
    if (t > 0 && t > lastT) { lastT = t; lastIdx = i; }
  }
  if (lastIdx >= 0) target = qs[lastIdx];
  else if (answeredIdx >= 0) target = qs[answeredIdx];
  else target = qs[0];
  scrollToQ(target);
  if (!quiet) {
    toast(lastIdx < 0 && answeredIdx < 0
      ? "已定位到 " + qLabel(target) + "（还没开始做）"
      : "已定位到 " + qLabel(target) + "（上次做到这里）");
  }
}
function jumpToNo() {
  const el = document.getElementById("jumpno");
  if (!el) return;
  const n = parseInt(el.value, 10);
  if (!n || n < 1) { toast("请输入要跳转的题号"); return; }
  const qs = visibleQs();
  let target = null;
  for (const q of qs) {
    const txt = ((q.querySelector(".no") || {}).textContent || "").replace(/\D/g, "");
    if (parseInt(txt, 10) === n) { target = q; break; }
  }
  if (!target) { toast("第 " + n + " 题不在当前显示的题目中"); return; }
  scrollToQ(target);
  toast("已跳到 " + qLabel(target));
}

/* ---------- 目录折叠 ---------- */
function navIsOpen() {
  const box = document.getElementById("navbox");
  if (!box) return false;
  return window.innerWidth <= 768 ? box.classList.contains("open") : !box.classList.contains("closed");
}
function setNavBtn() {
  const btn = document.querySelector(".nav-toggle");
  if (btn) btn.textContent = navIsOpen() ? "✕ 收起目录" : "☰ 目录";
}
function toggleNav() {
  const box = document.getElementById("navbox");
  if (!box) return;
  if (window.innerWidth <= 768) box.classList.toggle("open");
  else box.classList.toggle("closed");
  setNavBtn();
}
function closeNav() {
  const box = document.getElementById("navbox");
  if (!box) return;
  if (window.innerWidth <= 768) box.classList.remove("open");
  else box.classList.add("closed");
  setNavBtn();
}
function pickKp(btn, id) {
  f.kp = f.kp === id ? null : id;
  document.querySelectorAll(".gbtn").forEach((b) => {
    b.classList.toggle("on", b.getAttribute("data-kp") === f.kp);
  });
  applyFilters();
  if (window.innerWidth <= 768) closeNav();
  jumpToLatest();
}

/* ---------- 全局事件 ---------- */
document.addEventListener("change", (e) => {
  const inp = e.target;
  if (!inp || inp.type !== "radio") return;   // 多选走「确认作答」，填空走「核对」
  const q = inp.closest(".q");
  if (!q || inp.disabled) return;
  // 模拟练习页：只选择不判分、不写入刷题记录（交卷时统一判分）
  if (typeof state !== "undefined" && state && state.exam) return;
  rec[q.getAttribute("data-qid")] = { a: inp.value, t: Date.now() };
  saveLocal();
  paintAnswered(q, inp.value);
  applyFilters();
  scheduleSync();
});
window.addEventListener("resize", setNavBtn);

/* ---------- 页面启动助手 ---------- */
function bindCommonControls() {
  const kw = document.getElementById("kw");
  if (kw) kw.addEventListener("input", () => {
    f.kw = kw.value.trim().toLowerCase();
    applyFilters();
  });
  const jn = document.getElementById("jumpno");
  if (jn) jn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) jumpToNo();
  });
}
async function bootPage(renderFn, beforeRender) {
  // 0. 先确认身份并切换到该账号自己的缓存——必须在渲染前做，
  //    否则渲染的就是上一个账号的数据
  const s = await requireLogin();
  if (!s) return;
  migrateOldLocalData(userKey(s));
  loadForUser(s);
  // 页面自己的数据准备（如收藏夹按需加载切片），在渲染前做
  if (beforeRender) { try { await beforeRender(); } catch (e) {} }
  // 1. 渲染本地缓存（快）
  renderFn();
  paintAll();
  syncFavBtns();
  setNavBtn();
  applyFilters();
  // 2. 云端合并后重渲染
  try {
    await pullState();
  } catch (e) {
    setSyncLabel("云端读取异常，使用本机进度");
  }
  renderFn();
  paintAll();
  syncFavBtns();
  applyFilters();
  jumpToLatest();
}
async function doSignOut() {
  sessionStorage.setItem("mb_skipauto", "1");  // 主动退出：本次打开不再自动登录
  initCloud();
  try { await pushState(); } catch (e) {}
  await supa.auth.signOut();
  location.href = "index.html";
}

// 启动即检查版本（不依赖 DOM），发现新版本会清缓存并刷新
checkUpdate();
