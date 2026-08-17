# GitHub Discussions post draft

> Intended for the DeepSeek Harness **Show and tell** discussion category.

## English

**Title:** Unofficial DSH desktop builds for Windows and macOS

I packaged `dsh web` as a desktop app for Windows x64, Apple Silicon Macs, and Intel Macs. Each download contains a platform-native Node runtime and the official npm release of DeepSeek Harness, so users do not need to install Node.js or pnpm first.

**Repository:** https://github.com/zrt-ai-lab/dsh-desktop

The Electron shell contains no agent logic. It starts `dsh web --port 0` under the bundled standard Node binary, reads the loopback URL from stdout, and opens it in a desktop window. Tools, sandboxing, plugins, and sessions remain in the unmodified DSH backend.

Keeping the backend in a separate Node process avoids Electron ABI conflicts with native addons such as `node-pty`, `sharp`, and `koffi`. The full `node_modules` tree remains on disk because Cordis resolves plugin bundles through dynamic imports.

GitHub Actions builds Windows x64, macOS arm64, and macOS x64 on matching native runners. It resolves the official `@deepseek-ai/dsh` npm version before building and publishes SHA-256 checksums with every release. A release audit blocks credential files, secret-shaped strings, DSH user data, and build-machine paths from entering artifacts.

The Windows builds are unsigned, and the macOS builds are ad-hoc signed but not notarized, so SmartScreen and Gatekeeper warn or block on first launch. They are not affiliated with or endorsed by DeepSeek.

## 中文

**标题：非官方 DSH 桌面版：Windows、Apple Silicon 和 Intel Mac**

我把 `dsh web` 做成了 Windows x64、Apple Silicon Mac 和 Intel Mac 的桌面安装包。每个产物都包含对应平台的 Node 运行时和官方 npm 版 DeepSeek Harness，用户无需先安装 Node.js 或 pnpm。

**仓库：** https://github.com/zrt-ai-lab/dsh-desktop

Electron 外壳不包含 agent 逻辑，只负责用内置的标准 Node 启动 `dsh web --port 0`、从 stdout 读取回环地址，再打开桌面窗口。工具、沙箱、插件和会话仍由原版 DSH 后端负责。

后端使用独立 Node 进程，是为了避开 `node-pty`、`sharp`、`koffi` 等原生模块与 Electron ABI 不一致的问题。Cordis 会在运行时动态加载插件，因此 `node_modules` 也必须保留为真实目录树。

GitHub Actions 会在对应的原生 runner 上分别构建 Windows x64、macOS arm64 和 macOS x64，并在构建前解析官方 `@deepseek-ai/dsh` npm 版本。每个 release 都包含 SHA-256 校验文件，发布审计会阻止凭据、密钥特征串、DSH 用户数据和打包机路径进入产物。

目前 Windows 产物尚未签名，macOS 产物只有 ad-hoc 签名、未做 Apple 公证，首次启动会受到 SmartScreen 或 Gatekeeper 提示／拦截。本项目与 DeepSeek 官方无关。
