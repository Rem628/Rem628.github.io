# 大学题库智能学习升级（20261104c / Android 2.5）

20261104d / Android 2.6 修复：“继续刷题”使用 `prefs.lastStudy={value:{key,index,qid},t}` 随当前账号同步。只有进入章节、翻题、答题卡跳题、筛选定位及作答等明确操作更新时间；刷新、同步和恢复界面不会刷新旧位置的时间戳。已有本机位置兼容迁移，无旧时间戳时使用 0，避免覆盖其他设备较新位置。题目 ID 用于恢复准确位置，浏览位置不会伪造成作答记录。新位置同时进入备份和恢复，不需要修改数据库表或 RLS。

保留原生 HTML/CSS/JS、Supabase、MathJax、题目 ID 与所有分章原题文件。新增能力在独立模块中扩展。

## 开发和校验

使用 Node.js 20+，无需安装前端依赖。

```powershell
npm run build
npm run check
npm test
```

`build` 从 47 个分章文件自动收集引用图片，扫描 vendor 和 icons，校验资源存在并生成离线清单及字节数。修改资源后必须重新运行；发布时应把 version.json、app.js 的 MB_VER、sw.js 的缓存标识和 HTML 资源版本一起递增。构建不会修改题目内容。

浏览器必须通过 HTTP/HTTPS 预览，不能双击 HTML 使用 file:。测试使用独立浏览器配置和可丢弃的本机记录。不要对真实用户数据执行测试夹具。

## 数据版本和迁移

`NEU-STATE:<当前账号>` 是原子权威快照；旧版 REC/FAV/EXAMS 等镜像保留兼容。schema=4 仍保留 rec、fav、exams、exdel、recdel、favOps、favT，新增：

- events：按唯一事件 ID 合并，记录实际作答、手动掌握/加强及活跃时间。旧版本每题只保存最后一次作答，不编造更早的次数或日期。
- drafts：按试卷 ID 保存多份草稿，逐题 answerTimes 合并；closed 为终态，提交后旧设备不能重新打开同一草稿。旧 NEU-DRAFT 会迁入。
- prefs：主题、目标和搜索历史按键保存 value/t。
- feedback：当前用户的待提交纠错记录，不代表维护者已收到。

作答重置沿用 recdel 墓碑；早于重置的事件不参与复习和统计。计算题未自评时不计入正确率。考试在交卷后计入统计，自评后更新相同的事件 ID。

备份格式 version=3，默认当前账号，高级选项才会导出所有本机账号。可导入 version=2 及原始 NEU-* JSON，支持草稿。导入前写入 mb_before_import:<账号>，权威快照写入成功后才修改内存，失败回滚。旧版客户端不支持直接读取 V3 文件，迁移后请保留旧备份。

## 云端配置

仍使用既有 public.user_state(owner_id uuid, payload jsonb, updated_at timestamptz)。本次已在项目 pgpaegrihdhynevpyfes 应用 database 下的两份 SQL：收紧表权限，并保留旧客户端省略的新学习字段。现有 owner_id/auth.uid() RLS 和禁用账号策略保留；管理员 RPC 仅 service_role 能执行，前端不含 service_role key。

复制部署到其他 Supabase 项目时，先配置相同表、RLS、管理员 Edge Function，再应用 SQL；不得只创建公开表。当前 frontend 中仅有可公开的 publishable key。同步使用 updated_at 比较后更新，冲突重读合并；账号离线练习不依赖云端可用。

## Android 构建

源码和资源位于 android/。使用原签名目录才能覆盖安装保留原 WebView 数据；不要卸载旧 APK 后再安装。

```text
node scripts/build-android.cjs <tools目录> <原签名目录> <输出APK绝对路径>
```

工具目录结构：java/jdk-17.0.20.1+1、android/android-35/android.jar、build-tools/android-15、r8.jar、apktool.jar。签名目录需有原 mathbank-release.p12 与 password.txt；这些私密文件不在仓库或源码包中。脚本编译 Java、D8、Apktool、zipalign、apksigner 并验证签名。

APK 内置题库；后续网站更新先暂存完整公共资源及分章脚本，完整结束并复核版本后才在下次启动使用，避免逐文件联网失败时混用两版页面。旧域名本机数据迁移逻辑保留。

## 发布和回滚

发布到原 GitHub Pages 的 /Rem628.github.io/ 路径，保留原 Supabase Auth 回调地址。勿改网站域名、Android 包名、签名或 LOCAL_UID。SW 等已有标签页关闭后再启用新版，不强制中断未完成试卷，也不清理 localStorage。

回滚网页应使用新的版本号发布修复，避免同版本资源互相覆盖。数据库兼容触发器应保留，否则旧 APK 可能覆盖新增字段。需要恢复学习记录时优先合并备份，不要直接清空站点存储。

## 验证边界

已验证 Windows Edge、Chromium、手机尺寸模拟、离线题图/公式、备份恢复、考试和间隔复习。Chrome 正式版、手机真机、Android 安装运行、真实密码登录与两个真实设备同步仍需验收；APK 的构建、内置资源及签名验证不等于真机运行验证。官方规则沿用 2026-11-02 已有配置，本次未重新登录学校平台核验变化。反馈目前只有本机/本账号保存与导出，没有维护者收件服务。
