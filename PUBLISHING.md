# Publishing

GitHub Actions is the release source of truth. It installs an official npm release of `@deepseek-ai/dsh` independently on Windows x64, macOS arm64, and macOS x64 runners, then publishes all native artifacts together.

## Automatic upstream tracking

The `build` workflow checks `@deepseek-ai/dsh@latest` once per day. If release tag `dsh-v<official-version>` does not exist, it builds and publishes that version. Re-running the scheduled workflow after the release exists is a no-op.

## Manual build

Open **Actions → build → Run workflow**. Set `dsh_version` to an exact npm version or dist-tag. Leave `publish_release` disabled to keep the result as 14-day Actions artifacts, or enable it to publish `dsh-v<resolved-version>`.

## Desktop-shell release

For a shell change that should publish even when the bundled DSH version is unchanged:

```sh
npm version <desktop-version> --no-git-tag-version
git add package.json package-lock.json
git commit -m "release: prepare desktop <desktop-version>"
git tag v<desktop-version>
git push origin main v<desktop-version>
```

The workflow still resolves and records the official DSH version bundled inside that desktop release.

## Before publishing

Run the platform-local build and release audit described in [README.md](README.md). Windows, Apple Silicon, and Intel builds must be produced on matching runners because the packaged Node binary and native addons are platform- and architecture-specific.

The current workflow disables certificate discovery. Windows is unsigned; macOS uses an ad-hoc signature with hardened runtime disabled so the generated bundle has valid internal signatures. To distribute without SmartScreen or Gatekeeper warnings, configure Windows signing separately and add an Apple Developer ID Application certificate plus notarization credentials for macOS.
