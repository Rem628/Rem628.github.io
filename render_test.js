// renderFav 全流程模拟：验证 order 修复后不再抛错、列表正确生成
const fs = require("fs");
const els = {};
function mkEl(id) {
  return { id, style: {}, dataset: {}, innerHTML: "", textContent: "", value: "",
    classList: { add() {}, remove() {}, toggle() { return false; } },
    appendChild() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null };
}
global.document = {
  addEventListener() {}, readyState: "complete",
  getElementById(id) { return els[id] || (els[id] = mkEl(id)); },
  querySelectorAll: () => [], querySelector: () => null,
  createElement: () => mkEl(), body: mkEl(), head: mkEl(),
};
global.window = { addEventListener() {}, innerWidth: 1200, MB_VER: "20261030j",
  QDATA: {}, QMAP: {}, QREDIR: {}, META: {} };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.location = { href: "", search: "" };
global.navigator = {}; global.alert = () => {};
global.fetch = () => Promise.reject(new Error("offline"));
global.cloud = { database: { from: () => ({ select: () => Promise.resolve({ data: null }), upsert: () => Promise.resolve({}) }) }, auth: { getSession: () => Promise.resolve({ data: { user: { id: "t" } } }) } };

eval(fs.readFileSync("app.js", "utf8"));
const html = fs.readFileSync("fav.html", "utf8");
const blocks = html.match(/<script>([\s\S]*?)<\/script>/g).map(s => s.replace(/<\/?script>/g, ""));
eval(blocks[blocks.length - 1]);

// 造数据：META 两科目各两章两 kp，QDATA 四题，fav 收藏全部
window.META = {
  GS: { name: "高等数学", chapters: [{ name: "第1章 极限与连续", total: 2, kps: [{ name: "1.1 函数(52题)", id: "kpGS1", n: 2 }] }] },
  XD: { name: "线性代数", chapters: [{ name: "第二章 矩阵", total: 2, kps: [{ name: "矩阵及其运算、分块矩阵(94题)", id: "kpXD1", n: 2 }] }] },
};
window.QDATA = {
  g1: { q: "g1", tk: "GS", ch: "第1章 极限与连续", kpid: "kpGS1", kp: "1.1 函数(52题)", i: 0, a: "A", s: "x", o: { 1: "a", 2: "b" }, w: "w" },
  g2: { q: "g2", tk: "GS", ch: "第1章 极限与连续", kpid: "kpGS1", kp: "1.1 函数(52题)", i: 1, a: "B", s: "x", o: { 1: "a", 2: "b" }, et: "解析文字" },
  x1: { q: "x1", tk: "XD", ch: "第二章 矩阵", kpid: "kpXD1", kp: "矩阵及其运算、分块矩阵(94题)", i: 0, a: "C", t: "calc", tag: "计算", s: "\\(A\\)", o: {}, eh: "\\(x=1\\)" },
  x2: { q: "x2", tk: "XD", ch: "第二章 矩阵", kpid: "kpXD1", kp: "矩阵及其运算、分块矩阵(94题)", i: 1, a: "B", s: "x", o: { 1: "a", 2: "b", 3: "c", 4: "d" }, w: "w" },
};
fav = ["g1", "g2", "x1", "x2"];

let err = null;
try { renderFav(); } catch (e) { err = e; }
console.log("renderFav 全流程:", err ? "抛错 ✗ " + err.message : "通过 ✓");
const listHtml = els["favlist"] ? els["favlist"].innerHTML : "";
console.log("科目条:", (listHtml.match(/fav-tk/g) || []).length, "个 | 章节条:", (listHtml.match(/fav-ch/g) || []).length, "个 | kp-block:", (listHtml.match(/kp-block/g) || []).length, "个");
console.log("题目渲染:", (listHtml.match(/class="q"/g) || []).length, "/4");
// 全部科目 → 切换到 XD
try { switchTk("XD"); console.log("switchTk(XD): 通过 ✓"); } catch (e) { console.log("switchTk: 抛错 ✗", e.message); }
// 回全部
try { switchTk(null); console.log("switchTk(null): 通过 ✓"); } catch (e) { console.log("switchTk(null): 抛错 ✗", e.message); }
