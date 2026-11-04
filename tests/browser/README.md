# 浏览器回归

这些文件是 Playwright CLI `run-code` 的异步函数，不使用 @playwright/test，也不增加网站运行时依赖。已在 Edge 156 和 Chromium 153 的独立配置目录运行。

预览服务须位于 `http://127.0.0.1:4173/Rem628.github.io/`；工作目录准备 work/ 与 work/browser-screenshots/。浏览器会有自动保存、写入本机学习数据和导出文件行为，必须使用可丢弃的专用 profile，不能在真实用户数据上运行。

CLI 打开预览后：

```powershell
$browserScenario = Get-Content -Raw -Encoding utf8 tests/browser/browser-phase1.js
npx --package @playwright/cli playwright-cli run-code $browserScenario
```

依次运行 phase1（生成备份文件）、phase2（含浏览器时钟快进）、review-backup、offline、visual。offline 会注入一次预期 HTTP 503，验证失败资源不被算作成功，然后修复并断网刷新；该 HTTP 错误属于测试注入。final 创建独立的 Android 触控模拟上下文，检查多草稿、横屏、大字和真实无效账号登录错误。

这些场景不能替代 Chrome 正式版、Android 真机、真实账号成功登录或两个真实设备云同步的最终验收。源码 ZIP 无 .git 时，core.cjs 仍可使用 question-integrity.json 检查题库完整性。
