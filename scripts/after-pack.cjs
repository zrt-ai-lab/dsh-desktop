'use strict';
/** Apply a valid ad-hoc signature after adding the bundled runtime on macOS. */
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

/**
 * Sign the complete generated app bundle when no Developer ID is configured.
 * @param {import('app-builder-lib').AfterPackContext} context electron-builder context.
 */
module.exports = function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], {
    stdio: 'inherit',
  });
};
