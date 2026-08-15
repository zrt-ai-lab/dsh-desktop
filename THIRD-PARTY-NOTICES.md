# Third-Party Notices

This project is an Electron shell. The installer it produces redistributes
software written by others, listed below. The shell's own source code is
MIT licensed (see [LICENSE](LICENSE)).

## Summary

| Component | License | Redistribution |
|---|---|---|
| DeepSeek Harness (`@deepseek-ai/dsh` and its packages) | MIT | permitted with notice |
| Node.js runtime (`node.exe`) | MIT (with ICU/OpenSSL notices) | permitted with notice |
| Electron / Chromium | MIT / BSD-3-Clause and others | permitted with notice |
| npm dependency tree (532 packages) | MIT, Apache-2.0, BSD, ISC, 0BSD, Python-2.0 | permissive |
| **libvips** (via `@img/sharp-win32-x64`) | **LGPL-3.0-or-later** | permitted — see below |

A full sweep of the 532 bundled packages found no GPL, AGPL, SSPL, or
non-commercial licenses. The one copyleft component is libvips, addressed next.

## libvips (LGPL-3.0-or-later)

The image library `libvips` ships as `libvips-42.dll` inside
`resources/runtime/dsh/node_modules/@img/sharp-win32-x64/lib/`, pulled in by
`sharp`, which DeepSeek Harness depends on.

libvips is licensed under the **LGPL-3.0-or-later**. This project complies as
follows:

- **Dynamic linking.** libvips is distributed as a separate, unmodified DLL and
  is loaded dynamically at runtime. It is not statically linked into, and does
  not form a derived work with, this project's code. The LGPL permits
  distributing a work that links against an LGPL library this way, under any
  license.
- **No modification.** The binary is redistributed byte-for-byte as published
  by the `@img/sharp-win32-x64` package. No patches are applied.
- **Notice.** This file, and the license text shipped inside the package
  directory, serve as the required notice.
- **Replaceability.** Because the library is a standalone DLL, a recipient may
  replace it with their own build of libvips by substituting the file in the
  installation directory.
- **Source availability.** libvips source is published at
  https://github.com/libvips/libvips and the packaging used by sharp at
  https://github.com/lovell/sharp.

If you modify libvips and redistribute this application with the modified
build, the LGPL obliges you to release those modifications under the LGPL.

## Node.js

The bundled `node.exe` is redistributed unmodified. Node.js is MIT licensed and
incorporates OpenSSL, ICU, zlib, and other components under their own terms;
the complete notice is available at
https://github.com/nodejs/node/blob/main/LICENSE

## Electron

Electron is MIT licensed and embeds Chromium, which is BSD-3-Clause and carries
extensive additional notices. `electron-builder` places the full text in the
installation directory as `LICENSES.chromium.html` and
`LICENSE.electron.txt`. Those files are shipped with every build and must not
be removed.

## DeepSeek Harness

DeepSeek Harness is MIT licensed, Copyright (c) 2026 DeepSeek. It is
redistributed unmodified. The upstream project does not accept external pull
requests at this time and is not affiliated with this packaging effort.

Upstream: https://github.com/deepseek-ai/deepseek-harness

## Regenerating this list

The license sweep can be reproduced against a staged runtime:

```powershell
Get-ChildItem runtime\dsh\node_modules -Recurse -Depth 2 -Filter package.json |
  Where-Object { $_.FullName -notmatch 'node_modules.*node_modules' } |
  ForEach-Object { (Get-Content $_.FullName -Raw | ConvertFrom-Json).license } |
  Group-Object | Sort-Object Count -Descending
```
