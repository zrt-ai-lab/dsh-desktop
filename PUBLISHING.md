# 推送到 GitHub

这台机器上没有 GitHub 认证（`gh` 未安装、无凭据助手、无 token），所以推送需要你亲自完成一次认证。下面两条路选一条。

先设置提交身份 —— 当前提交的作者是占位值 `dsh-desktop@localhost`，长期维护应换成你自己的：

```powershell
cd C:\Users\Administrator\Desktop\dsh-desktop

git config user.name  "你的名字"
git config user.email "你的邮箱@example.com"

# 把已有的那次提交改成新身份（只有一个提交，安全）
git commit --amend --reset-author --no-edit
```

改完确认一下：

```powershell
git log -1 --format='%an <%ae>'
```

---

## 路线 A：用 gh CLI（推荐，建仓库 + 推送一步完成）

安装：

```powershell
winget install --id GitHub.cli -e
```

装完**重开一个终端**，然后：

```powershell
cd C:\Users\Administrator\Desktop\dsh-desktop

gh auth login          # 选 GitHub.com → HTTPS → 浏览器登录

gh repo create dsh-desktop-windows --public --source=. --remote=origin --push `
  --description "Unofficial Windows desktop build of DeepSeek Harness - one installer, no prerequisites"
```

加上 topic，这是 CONTRIBUTING 点名的插件发现机制：

```powershell
gh repo edit --add-topic dsh-plugin --add-topic dsh --add-topic electron --add-topic windows
```

## 路线 B：网页建仓库 + 手动推送

1. 打开 https://github.com/new
2. 仓库名 `dsh-desktop-windows`，Public
3. **不要**勾选 Add README / .gitignore / license —— 本地已经有了，勾了会冲突
4. 然后：

```powershell
cd C:\Users\Administrator\Desktop\dsh-desktop
git remote add origin https://github.com/<你的用户名>/dsh-desktop-windows.git
git push -u origin main
```

首次推送会弹出 GitHub 登录（浏览器或 Personal Access Token）。用 token 的话需要 `repo` 权限，在 https://github.com/settings/tokens 生成。

之后到仓库页面 About 右侧的齿轮里加上 topics：`dsh-plugin`、`dsh`、`electron`、`windows`。

---

## 发布第一个版本

推送后打 tag，CI 会自动构建并创建 Release：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

到 Actions 标签页看构建进度（Windows runner，约 10–20 分钟）。完成后 Releases 页会出现两个 `.exe` 和 `SHA256SUMS.txt`。

⚠️ CI 默认拉 `@deepseek-ai/dsh@latest`。DSH 目前是 rc 阶段，如果要锁定具体版本，用 Actions → build → Run workflow，在 `dsh_version` 里填 `0.1.0-rc.6`。

## 后续维护

DSH 发新版后要跟进时：

```powershell
npm run stage      # 重新抓取运行时（默认取 npx 缓存里的最新版）
npm run dist       # 本地构建 + 安全审计
```

本地验证没问题后，提升 `package.json` 里的 `version`，提交，打新 tag 推送即可。

## 分享前最后一件事

把 `DISCUSSION-POST.md` 里的 `<YOUR-REPO-URL>` 替换成实际地址，再发到
https://github.com/deepseek-ai/deepseek-harness/discussions （建议分类 Show and tell）。
