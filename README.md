# DSH Desktop for Windows

An unofficial Windows desktop build of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — one installer, no prerequisites.

> Not affiliated with or endorsed by DeepSeek. DSH is redistributed unmodified under its MIT license.

## Install

Grab the latest [release](../../releases):

| File | Use |
|---|---|
| `DSH-<version>-x64-setup.exe` | Installer, with Start Menu and desktop shortcuts |
| `DSH-<version>-x64-portable.exe` | Single file, runs without installing |

Windows 10 or 11, 64-bit. Nothing else needed — Node.js and every dependency are bundled.

**On first launch Windows will warn you.** These builds are unsigned, so SmartScreen shows *"Windows protected your PC"*. Choose **More info → Run anyway**. Verify your download against `SHA256SUMS.txt` first if you care to:

```powershell
Get-FileHash .\DSH-0.1.0-x64-setup.exe -Algorithm SHA256
```

**The first start takes 30–55 seconds** while Windows reads the ~340 MB runtime off disk. A splash screen tracks progress. Later starts are much faster.

## Set up a model

The app opens with no credentials configured. Either:

- **In the app** — Settings → Models, paste your key. It is stored in `%USERPROFILE%\.dsh`.
- **Environment variable** — keeps the key off disk entirely:
  ```powershell
  setx DEEPSEEK_API_KEY "your-key-here"
  ```
  Then restart the app.

Already use the `dsh` CLI? The desktop app shares the same `%USERPROFILE%\.dsh`, so your existing sessions, profiles, and credentials carry over untouched.

## How it works

The shell contains no agent logic. It:

1. shows a splash screen,
2. spawns the real backend — `dsh web --port 0` — under a bundled `node.exe`,
3. reads the URL the backend prints, and points a window at it.

Everything the agent does (tools, sandboxing, plugins, sessions) happens inside that backend process, identical to running `dsh web` in a terminal.

**Why the backend runs in its own process:** DSH loads prebuilt native addons (`node-pty`, `sharp`, `koffi`) compiled against standard Node's ABI. They fail to load inside Electron. A child process sidesteps the ABI problem entirely and keeps a backend crash from taking the window down with it.

**Why it isn't a single .exe:** the cordis loader resolves plugin bundles by dynamic `import()` at runtime, so `pkg`-style static bundling breaks it. `node_modules` ships as a real directory tree.

## Your data

| What | Where |
|---|---|
| Sessions, profiles, credentials | `%USERPROFILE%\.dsh` (shared with the CLI) |
| Logs | `%APPDATA%\DSH\logs\dsh-desktop.log` |

Uninstalling **does not** delete `%USERPROFILE%\.dsh`. Remove it by hand if you want a clean slate.

⚠️ That directory holds your API keys and full conversation history. Don't copy it to another machine or hand it to someone else to "save them the setup" — the installer is safe to share, that folder is not.

## Build it yourself

```powershell
npm install
npm run stage      # copy node.exe + the DSH runtime into runtime/
npm run dev        # run against the staged runtime
npm run dist       # produce installer + portable, then audit them
```

`stage` pulls from your npx cache by default. To pin a specific release:

```powershell
mkdir dsh-source; cd dsh-source
npm init -y; npm install @deepseek-ai/dsh@0.1.0-rc.6
cd ..
$env:DSH_SOURCE_ROOT = "$PWD\dsh-source"
npm run stage
```

Tag a commit `v*` to have CI build and publish a release.

### Layout

```
src/main.js                 Electron main process — the entire shell
src/splash.html             startup feedback for the slow cold start
scripts/stage-runtime.mjs   copies node.exe + DSH into runtime/
scripts/audit-release.mjs   release gate: blocks leaked secrets and user data
.github/workflows/build.yml CI build and release
```

### The release gate

`npm run audit` runs after every packaging step and **fails the build** if artifacts contain credential files, secret-shaped strings (OpenAI/Anthropic/AWS/GitHub/Google/Slack keys, private keys, bearer tokens), DSH user-data directories, or the build machine's paths. It is wired into `npm run dist` so it cannot be skipped by accident.

## Known limits

- Windows x64 only.
- Unsigned — SmartScreen warns on first run. Fixing this needs a code-signing certificate.
- Cold start is slow (see above).
- `dsh plugin add` needs pnpm, which is not bundled. Install plugins from the CLI.
- The backend always binds `--port 0` (an OS-assigned port), so it never collides with a `dsh web` you already have running.

## License

Shell code: [MIT](LICENSE). Bundled third-party software, including the LGPL-3.0 libvips library, is documented in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
