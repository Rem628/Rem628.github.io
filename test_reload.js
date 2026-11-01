/* 回归测试：「带着已有作答记录重新打开页面」时，已答题目必须仍然显示为已答。
   背景：bootPage() 会渲染两次（本地缓存 + 云端合并），原实现漏了渲染后的
   「回扫标已答」，导致顶部统计显示「已答 2 正确率 50%」但题目本身是空白未答状态。 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const loadJS = (f, v) => JSON.parse(read(f).slice(read(f).indexOf("=") + 1).replace(/;\s*$/, ""));

const QDATA = loadJS("questions.js", "QDATA");
const META = loadJS("meta.js", "META");

/* 取 GS 第 1 章的前 3 题：2 题预置作答（一题对、一题错），第 3 题留空 */
const chName = META.GS.chapters[0].name;
const inCh = Object.values(QDATA).filter((q) => q.tk === "GS" && q.ch === chName);
const picked = inCh.slice(0, 3).map((q) => q.q);
const ansOf = (qid) => QDATA[qid].a;
const wrongOf = (qid) => ["A", "B", "C", "D"].filter((v) => v !== ansOf(qid))[0];

const preset = {};
preset[picked[0]] = { a: ansOf(picked[0]), t: 1000 };      // 答对
preset[picked[1]] = { a: wrongOf(picked[1]), t: 2000 };    // 答错

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
    // 模拟「上次答过题」：页面脚本执行前先写入 localStorage
    window.localStorage.setItem("NEU-REC:testuid", JSON.stringify(preset));
    window.WorkBuddyCloud = {
      createWorkBuddyCloud() {
        return {
          // 返回一个有效会话，让 bootPage 走完「云端合并后重渲染」这一遍
          auth: {
            getSession: async () => ({ data: { user: { id: "testuid" } }, error: null }),
            signOut: async () => {},
          },
          database: {
            from() {
              return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
            },
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
  let pass = true;
  const check = (n, c, extra) => {
    console.log((c ? "  PASS " : "  FAIL ") + n + (extra ? "  " + extra : ""));
    if (!c) pass = false;
  };
  const qEl = (qid) => doc.querySelector('.q[data-qid="' + qid + '"]');

  const a = qEl(picked[0]), b = qEl(picked[1]), c = qEl(picked[2]);
  check("三道题都渲染出来了", !!a && !!b && !!c);

  check("答对的题仍显示「回答正确」", a.querySelector(".fb").className.indexOf("ok") >= 0,
        JSON.stringify(a.querySelector(".fb").textContent));
  check("答错的题仍显示「回答错误」", b.querySelector(".fb").className.indexOf("no") >= 0,
        JSON.stringify(b.querySelector(".fb").textContent));
  check("已答题的选项被锁死", [...a.querySelectorAll("input")].every((i) => i.disabled));
  check("已答题的解析已展开", a.querySelector(".why").classList.contains("show"));
  check("未答的题保持空白可作答", c.querySelector(".fb").className.trim() === "fb"
        && [...c.querySelectorAll("input")].every((i) => !i.disabled));

  const score = doc.getElementById("score").textContent;
  check("顶部统计为已答 2 / 正确率 50%", /已答\s*2\b/.test(score) && /50%/.test(score), JSON.stringify(score));
  check("统计与题面显示一致（不再是「有数据但题目空白」）",
        a.querySelector(".fb").className.indexOf("ok") >= 0 && /已答\s*2\b/.test(score));

  console.log("\n>>> 结果:", pass ? "PASS 重新打开页面后已答状态正确保留" : "FAIL");
  process.exit(pass ? 0 : 1);
}, 1500);
