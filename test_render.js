/* 在线版渲染冒烟测试：
   把外部脚本内联后交给 jsdom 执行（不加载 CDN，改用注入的模拟云服务），
   验证章节渲染、作答、收藏、题组筛选、题号跳转是否正常。 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");

let html = read("ch.html");
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/, ""); // 去掉 CDN
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
          auth: { getSession: async () => ({ data: { user: { id: "testuid", raw: { email: "t@t.com" } } }, error: null }), signOut: async () => {} },
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
const doc = w.document;

setTimeout(() => {
  const qs = [...doc.querySelectorAll(".q")];
  const blocks = [...doc.querySelectorAll(".kp-block")];
  const btns = [...doc.querySelectorAll(".gbtn")];
  const title = doc.getElementById("title").textContent;
  const sub = doc.getElementById("sub").textContent;

  console.log("章节标题:", title);
  console.log("副标题:", sub);
  console.log("题目数:", qs.length, "| 知识点组:", blocks.length, "| 题组按钮:", btns.length);

  const meta = JSON.parse(read("meta.js").replace("window.META=", "").replace(/;$/, ""));
  const expectQ = meta.GS.chapters[0].total;
  const expectKp = meta.GS.chapters[0].kps.length;

  let pass = true;
  const check = (n, c, extra) => {
    console.log((c ? "  PASS " : "  FAIL ") + n + (extra ? "  " + extra : ""));
    if (!c) pass = false;
  };

  check("题目数与元数据一致", qs.length === expectQ, `${qs.length} vs ${expectQ}`);
  check("知识点组数与元数据一致", blocks.length === expectKp, `${blocks.length} vs ${expectKp}`);
  check("题组按钮与分组数一致", btns.length === expectKp);
  check("题干图片指向本地 img/", qs[0].querySelector(".stem img").getAttribute("src").startsWith("img/"),
        qs[0].querySelector(".stem img").getAttribute("src").slice(0, 40));

  // 作答
  const q0 = qs[0];
  const ans = q0.getAttribute("data-ans");
  const inp = q0.querySelector('.opt[data-v="' + ans + '"] input');
  inp.checked = true;
  inp.dispatchEvent(new w.Event("change", { bubbles: true }));
  check("答对后标记为正确", q0.querySelector(".fb").className.indexOf("ok") >= 0);
  check("选中项标绿", q0.querySelector(".opt.right") !== null);
  check("答案写入本地缓存", Object.keys(JSON.parse(w.localStorage.getItem("NEU-REC:testuid"))).length === 1);

  // 收藏
  const fb = q0.querySelector(".fav-btn");
  fb.dispatchEvent(new w.Event("click", { bubbles: true }));
  check("收藏生效", JSON.parse(w.localStorage.getItem("NEU-FAV:testuid")).length === 1);
  check("星标变实心", fb.classList.contains("on"));

  // 题组筛选
  const firstKp = blocks[0].getAttribute("data-kp");
  w.eval(`pickKp(document.querySelector('.gbtn'), '${firstKp}');`);
  const vis = w.eval("visibleQs().length");
  const inBlock = blocks[0].querySelectorAll(".q").length;
  check("选择题组后只显示该组", vis === inBlock, `${vis} vs ${inBlock}`);

  // 题号跳转
  doc.getElementById("jumpno").value = "5";
  w.eval("jumpToNo();");
  const t = doc.getElementById("toast").textContent;
  check("题号跳转有反馈", /第 5 题/.test(t), JSON.stringify(t));

  console.log("\n>>> 结果:", pass ? "PASS 在线版页面渲染与交互正常" : "FAIL");
  process.exit(pass ? 0 : 1);
}, 1500);
