/* C语言题库（文本题）冒烟测试：
   - 文本题干/选项/解析能正常渲染（不能还是按图片渲染）
   - 选择题 4 个选项、判断题只有「正确 / 错误」两个
   - 含 <stdio.h>、&a 这类字符的题干要被正确转义，不能被当成 HTML
   - 作答后判分与解析显示正常 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const loadJS = (f) => JSON.parse(read(f).slice(read(f).indexOf("=") + 1).replace(/;\s*$/, ""));
const META = loadJS("meta.js");

function build(tk, c) {
  let html = read("ch.html")
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^"]*"><\/script>/, "")
    .replace('<script src="questions.js"></script>', "<script>" + read("questions.js") + "</script>")
    .replace('<script src="meta.js"></script>', "<script>" + read("meta.js") + "</script>")
    .replace('<script src="app.js"></script>', "<script>" + read("app.js") + "</script>");
  return new JSDOM(html, {
    url: `http://localhost/ch.html?tk=${tk}&c=${c}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.WorkBuddyCloud = {
        createWorkBuddyCloud() {
          return {
            auth: {
              getSession: async () => ({ data: { user: { id: "cyuid", raw: { email: "c@t.com" } } }, error: null }),
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
}

let pass = true;
const check = (n, c, extra) => {
  console.log((c ? "  PASS " : "  FAIL ") + n + (extra ? "  " + extra : ""));
  if (!c) pass = false;
};

const cy = META.CY;
console.log("C语言章节:", cy.chapters.map((c) => `${c.name}(${c.total})`).join(" | "));

// ---------- 单项选择题 ----------
const d1 = build("CY", 0);
setTimeout(() => {
  const doc1 = d1.window.document;
  const qs = [...doc1.querySelectorAll(".q")];
  check("单项选择题数量 = 60", qs.length === 60, `${qs.length}`);
  check("题干用文本渲染而非图片",
        qs[0].querySelector(".stem .txt") !== null && qs[0].querySelector(".stem img") === null,
        JSON.stringify((qs[0].querySelector(".stem .txt") || {}).textContent || ""));
  check("每个选项都是文本", [...qs[0].querySelectorAll(".opt .txt")].length === 4);
  check("选项字母为 A/B/C/D",
        [...qs[0].querySelectorAll(".opt .lbl")].map((e) => e.textContent).join("") === "ABCD");

  // 转义：含 <stdio.h> 的题不能被解析成 HTML 元素
  const withHeader = qs.find((q) => q.getAttribute("data-txt").includes("stdio"));
  check("找到含 <stdio.h> 的题目", !!withHeader);
  if (withHeader) {
    const t = withHeader.querySelector(".stem .txt").textContent;
    check("<stdio.h> 被转义而非当成标签",
          t.includes("<stdio.h>") && withHeader.querySelector(".stem .txt").children.length === 0);
  }
  const withAmp = qs.find((q) => q.getAttribute("data-txt").includes("&a"));
  check("找到含 &a 的题目并正确转义", !!withAmp
        && withAmp.querySelector(".stem .txt").textContent.includes("&a"));

  // 作答
  const q0 = qs[0], ans = q0.getAttribute("data-ans");
  const inp = q0.querySelector(`.opt[data-v="${ans}"] input`);
  inp.checked = true;
  inp.dispatchEvent(new d1.window.Event("change", { bubbles: true }));
  check("答对后标绿并给出反馈", q0.querySelector(".fb").className.includes("ok"));
  const why = q0.querySelector(".why");
  check("解析文字存在且已展开",
        !!why.querySelector(".why-txt") && why.classList.contains("show"),
        JSON.stringify((why.querySelector(".why-txt") || {}).textContent || ""));

  d1.window.close();

  // ---------- 判断题 ----------
  const d2 = build("CY", 1);
  setTimeout(() => {
    const doc2 = d2.window.document;
    const qs2 = [...doc2.querySelectorAll(".q")];
    check("判断题数量 = 50", qs2.length === 50, `${qs2.length}`);
    const labels = [...qs2[0].querySelectorAll(".opt .txt")].map((e) => e.textContent);
    check("判断题只有两枚选项：正确 / 错误",
          labels.length === 2 && labels[0] === "正确" && labels[1] === "错误", JSON.stringify(labels));
    check("判断题答案只可能是 A 或 B",
          qs2.every((q) => ["A", "B"].includes(q.getAttribute("data-ans"))));

    // 选「错误」验证判分
    const q = qs2.find((x) => x.getAttribute("data-ans") === "B");
    const i2 = q.querySelector('.opt[data-v="B"] input');
    i2.checked = true;
    i2.dispatchEvent(new d2.window.Event("change", { bubbles: true }));
    check("判断题选对后标绿", q.querySelector(".fb").className.includes("ok"));
    const i3 = qs2.find((x) => x.getAttribute("data-ans") === "A");
    const w3 = i3.querySelector('.opt[data-v="B"] input');
    w3.checked = true;
    w3.dispatchEvent(new d2.window.Event("change", { bubbles: true }));
    check("判断题选错后标红", i3.querySelector(".fb").className.includes("no"));

    console.log("\n>>> 结果:", pass ? "PASS C语言文本题库渲染与作答正常" : "FAIL");
    process.exit(pass ? 0 : 1);
  }, 1500);
}, 1500);
