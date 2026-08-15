# GitHub Discussions 发帖草稿

> 用途：发到 deepseek-ai/deepseek-harness 的 Discussions（建议分类 Show and tell）。
> 发帖前把 `<YOUR-REPO-URL>` 换成你的仓库地址。
> CONTRIBUTING 说明官方目前不接受外部 PR，但明确鼓励社区做插件、写教程、分享项目 —— 这类分享帖正是他们欢迎的形式。

---

## 英文版（建议正文用这个）

**Title:** Windows desktop build of DSH — one installer, no prerequisites

Hi everyone,

I packaged `dsh web` as a Windows desktop app so it can be installed like ordinary
software: one `.exe`, no Node, no pnpm, nothing to set up first. Sharing it in case
it is useful to others, and because CONTRIBUTING points ecosystem work here rather
than to pull requests.

**Repo:** <YOUR-REPO-URL>

### What it is

An Electron shell with no agent logic of its own. It:

1. shows a splash screen,
2. spawns the real backend — `dsh web --port 0` — under a bundled `node.exe`,
3. reads the URL the backend prints on stdout and points a window at it.

Tools, sandboxing, plugins, and sessions all stay inside that backend process,
behaving exactly as they do from a terminal. DSH itself is redistributed
unmodified.

### Two things I got wrong first, in case they save someone time

**Bundling to a single executable does not work.** I tried it before reading
carefully. The cordis loader resolves plugin bundles via dynamic `import()` at
runtime, so `pkg`-style static bundling breaks boot. `node_modules` has to ship
as a real directory tree.

**Running the backend inside Electron does not work either.** DSH loads prebuilt
native addons (`node-pty`, `sharp`, `koffi`) compiled against standard Node's
ABI, and they fail to load under Electron's. Spawning a child process under a
bundled `node.exe` sidesteps the ABI question completely, and has the nice
side effect that a backend crash cannot take the window down with it.

### Notes

- `%USERPROFILE%\.dsh` is shared with the CLI, so existing sessions, profiles,
  and credentials carry over. Uninstalling leaves that directory alone.
- Cold start is 30–55s while Windows reads the ~340 MB runtime off disk; the
  splash screen exists because without it the launch looks hung.
- Installer is ~178 MB.
- Builds are unsigned, so SmartScreen warns on first run. Checksums are
  published with each release.
- The build runs a release audit that fails packaging if credential files,
  secret-shaped strings, user-data directories, or build-machine paths reach the
  artifacts. I added it after catching my own staging script writing the build
  machine's local path into shipped metadata.

Happy to hear if the approach is wrong-headed anywhere — particularly around the
native-module handling, which is the part I am least sure generalizes.

Not affiliated with DeepSeek; just packaging.

---

## 中文版（可作为回帖补充，或用于国内社区）

**标题：DSH 的 Windows 桌面版打包 —— 一个安装包，无需任何前置依赖**

大家好，

我把 `dsh web` 打包成了 Windows 桌面客户端，可以像普通软件一样安装：一个 `.exe`，
不需要 Node、pnpm，也不用预先配置任何环境。CONTRIBUTING 里提到官方目前不接受外部
PR、但鼓励社区做生态项目，所以发在这里分享。

**仓库：** <YOUR-REPO-URL>

### 这是什么

一个不含任何 agent 逻辑的 Electron 外壳。它只做三件事：

1. 显示启动画面；
2. 用内置的 `node.exe` 启动真正的后端 `dsh web --port 0`；
3. 从 stdout 读取后端打印的地址，把窗口指过去。

工具、沙箱、插件、会话全部留在那个后端进程里，行为与在终端运行完全一致。
DSH 本身原样分发，未做任何修改。

### 我一开始踩错的两个方向

**打成单个 exe 是行不通的。** cordis loader 在运行时通过动态 `import()` 解析插件
bundle，`pkg` 之类的静态打包会直接破坏启动流程。`node_modules` 必须作为真实目录树
随包分发。

**把后端跑在 Electron 进程里同样行不通。** DSH 依赖的预编译原生模块
（`node-pty`、`sharp`、`koffi`）是针对标准 Node 的 ABI 编译的，在 Electron 里加载
会失败。用内置 `node.exe` 起子进程可以彻底绕开 ABI 问题，附带的好处是后端崩溃
不会连带把窗口一起带走。

### 一些细节

- `%USERPROFILE%\.dsh` 与命令行版共享，既有会话、profile、凭据都能直接沿用；
  卸载不会删除该目录。
- 首次冷启动约 30–55 秒（要从磁盘读取约 340 MB 运行时），启动画面就是为此而加 ——
  没有它的话看起来像卡死了。
- 安装包约 178 MB。
- 未做代码签名，首次运行会触发 SmartScreen 提示；每个 release 都附 SHA256 校验值。
- 构建流程带一道发布审计：如果凭据文件、密钥特征串、用户数据目录或打包机路径
  进入了产物，直接让构建失败。这道检查是我发现自己的 staging 脚本把本机路径
  写进了随包元数据之后加的。

如果有哪里做得不对，欢迎指出 —— 尤其是原生模块的处理方式，这部分我不确定
是否能推广到其他场景。

与 DeepSeek 官方无关，纯粹是打包分享。
