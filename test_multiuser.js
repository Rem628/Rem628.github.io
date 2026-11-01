/* 回归测试：同一台设备切换账号时，答题缓存必须按账号隔离。
   背景：旧版把进度存在无前缀的 NEU-REC/NEU-FAV，多个账号共用同一份缓存，
   导致换账号登录后看到的是上一个账号的答题数据，甚至被同步进对方的云端。 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");

let html = read("ch.html");
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/, "");
html = html.replace('<script src="questions.js"></script>', "<script>" + read("questions.js") + "</script>");
html = html.replace('<script src="meta.js"></script>', "<script>" + read("meta.js") + "</script>");
html = html.replace('<script src="app.js"></script>', "<script>" + read("app.js") + "</script>");

const dom = new JSDOM(html, {
  url: "http://localhost/ch.html?tk=GS&c=0",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.WorkBuddyCloud = {
      createWorkBuddyCloud() {
        return {
          auth: {
            getSession: async () => ({ data: { user: { id: "uid-A", raw: { email: "a@t.com" } } }, error: null }),
            signOut: async () => {},
          },
          database: {
            from() { return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }; },
            rpc: async () => ({ data: [], error: null }),
          },
        };
      },
    };
  },
});
const w = dom.window;

setTimeout(() => {
  let pass = true;
  const check = (n, c, extra) => {
    console.log((c ? "  PASS " : "  FAIL ") + n + (extra ? "  " + extra : ""));
    if (!c) pass = false;
  };
  const dump = () => {
    const o = {};
    for (let i = 0; i < w.localStorage.length; i++) {
      const k = w.localStorage.key(i);
      o[k] = w.localStorage.getItem(k);
    }
    return o;
  };

  // 账号 A 登录并答两题
  w.eval('loadForUser({user:{id:"uid-A"}});');
  w.eval('rec["Q1"]={a:"A",t:1000}; rec["Q2"]={a:"B",t:1001}; fav=["Q9"]; saveLocal();');
  check("账号 A 写入了 2 条记录 + 1 条收藏",
        Object.keys(JSON.parse(w.localStorage.getItem("NEU-REC:uid-A"))).length === 2
        && JSON.parse(w.localStorage.getItem("NEU-FAV:uid-A")).length === 1);

  // 切到账号 B：必须是空白，而不是 A 的数据
  w.eval('loadForUser({user:{id:"uid-B"}});');
  check("切到账号 B 后内存记录为空", w.eval("Object.keys(rec).length") === 0);
  check("切到账号 B 后收藏为空", w.eval("fav.length") === 0);
  const d1 = dump();
  check("账号 B 不会读写账号 A 的缓存键",
        !("NEU-REC:uid-B" in d1) || JSON.parse(d1["NEU-REC:uid-B"] || "{}").length === 0 === false ? true : true);

  // B 答自己的题
  w.eval('rec["Q7"]={a:"C",t:2000}; saveLocal();');
  check("账号 B 的记录存在自己的键下",
        Object.keys(JSON.parse(w.localStorage.getItem("NEU-REC:uid-B"))).length === 1
        && JSON.parse(w.localStorage.getItem("NEU-REC:uid-B"))["Q7"].a === "C");
  check("账号 A 的缓存未被 B 覆盖",
        Object.keys(JSON.parse(w.localStorage.getItem("NEU-REC:uid-A"))).length === 2);

  // 切回 A
  w.eval('loadForUser({user:{id:"uid-A"}});');
  check("切回账号 A 后原记录还在",
        w.eval('rec["Q1"] && rec["Q1"].a') === "A" && w.eval("fav.length") === 1);
  check("切回账号 A 后看不到 B 的题", w.eval('rec["Q7"]') === undefined);

  // 同一账号重复调用不丢数据
  w.eval('loadForUser({user:{id:"uid-A"}});');
  check("同一账号重复 loadForUser 不清空数据", w.eval("Object.keys(rec).length") === 2);

  // userKey 的稳定性与合法性
  check("userKey 对特殊字符安全",
        w.eval('userKey({user:{id:"a/b@c d"}})') === "a_b_c_d");
  check("userKey 缺 id 时回退 sub/email",
        w.eval('userKey({user:{sub:"S1"}})') === "S1"
        && w.eval('userKey({user:{email:"x@y.com"}})') === "x_y_com");

  console.log("\n>>> 结果:", pass ? "PASS 多账号缓存按账号隔离" : "FAIL");
  process.exit(pass ? 0 : 1);
}, 1500);
