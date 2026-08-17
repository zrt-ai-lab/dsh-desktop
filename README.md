# DSH Desktop

Unofficial Windows and macOS desktop builds of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — install the app without first installing Node.js or pnpm.

> Not affiliated with or endorsed by DeepSeek. DSH is redistributed unmodified under its MIT license.

## Install

Download the files for your platform from the latest [release](../../releases):

| Platform | File | Use |
|---|---|---|
| Windows x64 | `DSH-<version>-windows-x64-setup.exe` | Installer with Start Menu and desktop shortcuts |
| Windows x64 | `DSH-<version>-windows-x64-portable.exe` | Portable executable |
| Apple Silicon Mac | `DSH-<version>-macos-arm64.dmg` | M1, M2, M3, M4, and newer Apple Silicon Macs |
| Intel Mac | `DSH-<version>-macos-x64.dmg` | Intel-based Macs |

Node.js and DSH's platform-native dependencies are bundled in every artifact. Every documented local or CI build reads `runtime/stage.json`, so the filename and the application version both use the exact official DSH version inside the app.

### Unnotarized build warnings

The Windows builds are unsigned. The macOS app is ad-hoc signed for bundle integrity but does not have an Apple Developer ID signature or notarization. Windows SmartScreen warns on first launch. On macOS, open the DMG, drag DSH to Applications, try to open it once, then approve DSH under **System Settings → Privacy & Security** if Gatekeeper blocks it. Do not bypass Gatekeeper globally.

Every release includes `SHA256SUMS.txt`. Verify a download before opening it:

```powershell
Get-FileHash .\DSH-0.1.0-rc.6-windows-x64-setup.exe -Algorithm SHA256
```

```sh
shasum -a 256 DSH-0.1.0-rc.6-macos-arm64.dmg
```

## Set up a model

The app opens with no credentials configured. Add a model in **Settings → Models**, or set `DEEPSEEK_API_KEY` before launching the app. DSH stores its profiles, sessions, and file-based credentials in the same `.dsh` directory used by the CLI:

| Data | Windows | macOS |
|---|---|---|
| DSH home | `%USERPROFILE%\.dsh` | `~/.dsh` |
| Desktop logs | `%APPDATA%\DSH\logs\dsh-desktop.log` | `~/Library/Application Support/DSH/logs/dsh-desktop.log` |

Uninstalling DSH Desktop does not delete `.dsh`. That directory can contain API keys and full conversation history; do not copy or distribute it with the app.

## How it works

The Electron shell contains no agent logic. It shows a splash screen, starts the real `dsh web --port 0` backend under a bundled platform-native Node binary, reads the loopback URL from stdout, and opens that URL in a desktop window.

Tools, sandboxing, plugins, and sessions remain inside the official DSH backend. A separate Node process is required because DSH uses native addons such as `node-pty`, `sharp`, and `koffi`, which target the standard Node ABI rather than Electron's ABI. The full `node_modules` tree also remains on disk because Cordis resolves plugin bundles through dynamic `import()` at runtime.

## Build locally

Install the official DSH release into a staging source directory first:

```sh
npm ci
npm install --prefix dsh-source @deepseek-ai/dsh@latest --no-audit --no-fund
```

Then build for the current operating system:

```sh
DSH_SOURCE_ROOT="$PWD/dsh-source" npm run dist:mac   # macOS, current CPU architecture
```

```powershell
$env:DSH_SOURCE_ROOT = "$PWD\dsh-source"
npm run dist:win
```

`npm run stage` can also use the most recent DSH installation in the local npx cache. `DSH_SOURCE_ROOT` is preferred for repeatable builds. Do not invoke `electron-builder` directly: the `dist:*` scripts use `scripts/build-release.mjs` to apply the staged official DSH version consistently.

### Release automation

The GitHub Actions workflow builds three native artifacts on their matching runners:

- Windows x64 on a Windows runner
- macOS arm64 on an Apple Silicon runner
- macOS x64 on an Intel runner

Manual runs accept an npm version or dist-tag such as `latest` or `0.1.0-rc.6`. A daily check resolves `@deepseek-ai/dsh@latest`; when that official version has no `dsh-v<version>` release yet, the workflow builds and publishes it automatically. A pushed `v*` or `dsh-v*` tag also publishes a release.

Each runner installs DSH natively before staging, so its bundled Node binary and native addons match both the operating system and CPU architecture. Do not build a universal macOS artifact by combining these trees: the runtime contains architecture-specific native dependencies.

### Release safety gate

`npm run audit` scans the staged runtime and unpacked application data. It fails if credential files, secret-shaped strings, DSH user-data directories, or build-machine paths enter the release. `npm run checksums` writes SHA-256 checksums for the distributable files.

## Known limits

- Windows artifacts are unsigned, and macOS artifacts are ad-hoc signed but not notarized. macOS distribution without Gatekeeper warnings requires an Apple Developer ID certificate and notarization; Windows reputation requires code signing.
- Screen, microphone, and camera capture remain subject to operating-system permissions. Windows supports Electron loopback system audio; the macOS shell currently requests screen video without loopback audio.
- `dsh plugin add` needs pnpm, which is not bundled. Install plugins from the CLI.
- The backend always binds an OS-assigned loopback port, so it does not collide with another `dsh web` process.

## License

Shell code: [MIT](LICENSE). Bundled third-party software, including the LGPL-3.0 libvips library, is documented in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
