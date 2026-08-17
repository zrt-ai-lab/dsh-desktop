'use strict';
/**
 * DSH desktop shell.
 *
 * The shell owns no agent logic. It spawns the real `dsh web` backend under the
 * bundled Node binary with `--port 0`, waits for the URL the backend prints on
 * stdout, and points a BrowserWindow at it. Everything the agent does — tools,
 * sandboxing, plugins, sessions — stays inside that backend process exactly as
 * it behaves from a terminal.
 *
 * Running the backend under a plain Node binary (not under Electron's Node) is
 * deliberate: DSH loads prebuilt native addons (node-pty, sharp, koffi) that are
 * compiled against standard Node's ABI and would fail to load inside Electron.
 */
const { app, BrowserWindow, Menu, shell, dialog, clipboard, session, desktopCapturer } = require('electron');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, createWriteStream } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');

/** Single instance: a second launch focuses the existing window instead of starting a second backend. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const IS_PACKAGED = app.isPackaged;
/** Staged runtime lives beside the app in resources/ when packaged, in the project during development. */
const RUNTIME_ROOT = IS_PACKAGED
  ? join(process.resourcesPath, 'runtime')
  : join(__dirname, '..', 'runtime');
const NODE_BIN = join(RUNTIME_ROOT, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
const DSH_BIN = join(RUNTIME_ROOT, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
/** User data (profiles, sessions, credentials) stays in the canonical DSH home, shared with the CLI. */
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const LOG_DIR = join(app.getPath('userData'), 'logs');
/** The backend prints `dsh web: http://127.0.0.1:<port>` once the server is bound. */
const URL_PATTERN = /dsh web:\s*(http:\/\/127\.0\.0\.1:\d+)/;
const BACKEND_TIMEOUT_MS = 90_000;

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {import('electron').BrowserWindow | null} */
let splashWindow = null;
/** @type {import('node:child_process').ChildProcess | null} */
let backend = null;
/** @type {import('node:fs').WriteStream | null} */
let logStream = null;
let backendUrl = null;
let quitting = false;
/** Recent backend output, replayed in the error dialog when startup fails. */
const recentOutput = [];

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  process.stdout.write(`${stamped}\n`);
  if (logStream) logStream.write(`${stamped}\n`);
  recentOutput.push(line);
  if (recentOutput.length > 60) recentOutput.shift();
}

function openLogStream() {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    logStream = createWriteStream(join(LOG_DIR, 'dsh-desktop.log'), { flags: 'a' });
  } catch {
    /* logging is best-effort; a read-only userData must not block startup */
  }
}

/** Verify the staged runtime exists before attempting to spawn it. */
function verifyRuntime() {
  const missing = [NODE_BIN, DSH_BIN].filter((path) => !existsSync(path));
  if (missing.length === 0) return null;
  return IS_PACKAGED
    ? `安装包缺少运行时文件：\n${missing.join('\n')}\n\n请重新安装 DSH。`
    : `运行时尚未准备好：\n${missing.join('\n')}\n\n请先在项目目录执行：\n  npm run stage`;
}

/**
 * Start the DSH web backend and resolve once it reports its bound URL.
 * @returns {Promise<string>} the loopback URL to load.
 */
function startBackend() {
  return new Promise((resolve, reject) => {
    log(`spawning backend: ${NODE_BIN} ${DSH_BIN} web --port 0`);
    backend = spawn(NODE_BIN, [DSH_BIN, 'web', '--port', '0'], {
      cwd: homedir(),
      env: {
        ...process.env,
        DSH_HOME,
        // Electron sets these for its own child processes; they confuse a plain Node child.
        ELECTRON_RUN_AS_NODE: undefined,
        NODE_OPTIONS: undefined,
      },
      windowsHide: true,
      // A separate POSIX process group lets shutdown reach backend descendants.
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`后端在 ${BACKEND_TIMEOUT_MS / 1000} 秒内没有报告服务地址。`));
    }, BACKEND_TIMEOUT_MS);

    const scan = (chunk) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) log(`[dsh] ${line}`);
      }
      const match = URL_PATTERN.exec(text);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        backendUrl = match[1];
        log(`backend ready at ${backendUrl}`);
        resolve(backendUrl);
      }
    };

    backend.stdout.on('data', scan);
    backend.stderr.on('data', scan);

    backend.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动后端进程：${error.message}`));
    });

    backend.on('exit', (code, signal) => {
      log(`backend exited (code=${code} signal=${signal})`);
      backend = null;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`后端进程在启动过程中退出（退出码 ${code}）。`));
      } else if (!quitting) {
        // The backend died while the app was running: surface it rather than leaving a blank window.
        closeSplash();
        dialog.showErrorBox('DSH 后端已停止', `后端进程意外退出（退出码 ${code}）。\n\n日志：${LOG_DIR}`);
        app.quit();
      }
    });
  });
}

/**
 * Show a splash window immediately.
 *
 * A cold start reads a ~340 MB runtime tree off disk and can take the better
 * part of a minute, so the shell must show something before the backend is
 * ready or the launch looks hung.
 */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#0f0f10',
    title: 'DSH',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#111111',
    title: 'DSH',
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer only ever loads the local DSH frontend over HTTP; it needs
      // no Node access of its own.
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links open in the real browser, never in an app window.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  mainWindow.loadURL(url);
  return mainWindow;
}

/**
 * Grant the renderer the screen/mic/camera access a browser would provide.
 *
 * Electron refuses `getDisplayMedia()` by default — there is no native picker,
 * so the shell must approve a source. Scheme 1 always selects the primary
 * screen. Windows also receives Electron's loopback system audio; macOS applies
 * its own Screen Recording permissions and receives video only here.
 *
 * This only touches the desktop shell's own session; the same DSH backend opened
 * in Chrome/Edge keeps using the browser's own picker and is unaffected.
 */
function setupMediaCapture() {
  const ses = session.defaultSession;

  // Screen capture: approve the primary screen whenever the page asks.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const primary = sources[0];
      if (!primary) {
        log('display-media request: no screen source available');
        callback({});
        return;
      }
      log(`display-media request granted: ${primary.name}`);
      callback(process.platform === 'win32' ? { video: primary, audio: 'loopback' } : { video: primary });
    } catch (error) {
      log(`display-media request failed: ${error.message}`);
      callback({});
    }
  });

  // Mic / camera: the reelspot plugin also requests these via getUserMedia.
  // Browsers prompt once; here we allow them so mixing works, and deny anything
  // else we have not explicitly reasoned about.
  const ALLOWED = new Set(['media', 'microphone', 'camera']);
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED.has(permission));
  });
  ses.setPermissionCheckHandler((webContents, permission) => ALLOWED.has(permission));

  log(`media capture: screen${process.platform === 'win32' ? '+loopback' : ''}, mic, camera granted`);
}

function buildMenu() {
  const template = [
      {
        label: '文件',
        submenu: [
          {
            label: '新建窗口',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => {
              if (backendUrl) createWindow(backendUrl);
            },
          },
          { type: 'separator' },
          { role: 'close', label: '关闭窗口' },
          ...(process.platform === 'darwin' ? [] : [{ role: 'quit', label: '退出' }]),
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' },
          { role: 'forceReload', label: '强制重新加载' },
          { type: 'separator' },
          { role: 'resetZoom', label: '实际大小' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '全屏' },
          { role: 'toggleDevTools', label: '开发者工具' },
        ],
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '复制服务地址',
            click: () => {
              if (backendUrl) clipboard.writeText(backendUrl);
            },
          },
          {
            label: '在浏览器中打开',
            click: () => {
              if (backendUrl) shell.openExternal(backendUrl);
            },
          },
          { type: 'separator' },
          { label: '打开数据目录 (.dsh)', click: () => shell.openPath(DSH_HOME) },
          { label: '打开日志目录', click: () => shell.openPath(LOG_DIR) },
          { type: 'separator' },
          {
            label: '关于 DSH',
            click: () => {
              let staged = {};
              try {
                staged = require(join(RUNTIME_ROOT, 'stage.json'));
              } catch {
                /* stage.json is informational only */
              }
              dialog.showMessageBox({
                type: 'info',
                title: '关于 DSH',
                message: 'DSH Desktop',
                detail: [
                  `外壳版本: ${app.getVersion()}`,
                  `DSH 版本: ${staged.dshVersion ?? '未知'}`,
                  `内置 Node: ${staged.nodeVersion ?? '未知'}`,
                  `运行平台: ${staged.platform ?? process.platform}/${staged.arch ?? process.arch}`,
                  `Electron: ${process.versions.electron}`,
                  `服务地址: ${backendUrl ?? '未启动'}`,
                  `数据目录: ${DSH_HOME}`,
                ].join('\n'),
                buttons: ['确定'],
              });
            },
          },
        ],
      },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 DSH' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 DSH' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 DSH' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Stop the backend, giving it a chance to flush sessions before forcing it down. */
function stopBackend() {
  if (!backend) return;
  quitting = true;
  const child = backend;
  backend = null;
  log('stopping backend');
  if (process.platform === 'win32') {
    try {
      // The backend spawns pwsh, subagents, and jobs; stop the whole tree.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      return;
    } catch (error) {
      log(`taskkill failed, falling back to kill(): ${error.message}`);
    }
  }
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
    else child.kill();
  } catch {
    /* the backend process group is already gone */
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else if (backendUrl) {
    createWindow(backendUrl);
  }
});

app.on('window-all-closed', () => {
  // During startup the splash is briefly the only window and closes just before
  // the main window appears; quitting on that transition would kill the launch.
  if (backendUrl === null) return;
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (!mainWindow && backendUrl) createWindow(backendUrl);
});
app.on('before-quit', stopBackend);
app.on('will-quit', stopBackend);

app.whenReady().then(async () => {
  openLogStream();
  log(`DSH desktop starting (packaged=${IS_PACKAGED})`);
  log(`runtime root: ${RUNTIME_ROOT}`);
  log(`DSH_HOME: ${DSH_HOME}`);

  const runtimeError = verifyRuntime();
  if (runtimeError) {
    dialog.showErrorBox('DSH 无法启动', runtimeError);
    app.quit();
    return;
  }

  setupMediaCapture();
  buildMenu();
  createSplash();

  try {
    const url = await startBackend();
    createWindow(url);
  } catch (error) {
    log(`startup failed: ${error.message}`);
    closeSplash();
    stopBackend();
    dialog.showErrorBox(
      'DSH 启动失败',
      `${error.message}\n\n最近的后端输出：\n${recentOutput.slice(-15).join('\n') || '（无输出）'}\n\n完整日志：${LOG_DIR}`,
    );
    app.quit();
  }
});
