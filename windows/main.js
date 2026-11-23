// ふたりボイス Windows版
// 中身は公開しているWebアプリ（いつも最新）。Windowsアプリとしての窓・マイク・画面共有・Googleログインのお手伝いをする。
const { app, BrowserWindow, shell, ipcMain, session, desktopCapturer, dialog, Tray, Menu, Notification } = require('electron');
const path = require('path');
const crypto = require('crypto');
const APP_URL = require('./config.json').url;           // 例: https://xxxx.web.app/app/
const ORIGIN = new URL(APP_URL).origin;
const SCHEME = 'futarivoice';

app.setAppUserModelId('app.futarivoice.desktop');
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient(SCHEME);
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let pending = null;   // Googleログインを待っているところ { state, resolve, reject, timer }
let tray = null, keepBg = true, quitting = false, hintShown = false;   // ×でとじても右下（タスクトレイ）で待つ

function focusWin() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
// ブラウザでGoogleログインが終わると futarivoice://auth?state=...&id_token=... でもどってくる
function handleUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== SCHEME + ':' || url.hostname !== 'auth') return;
    const state = url.searchParams.get('state'), token = url.searchParams.get('id_token');
    if (pending && token && state === pending.state) { clearTimeout(pending.timer); pending.resolve(token); pending = null; }
    focusWin();
  } catch (e) { /* へんなリンクは無視 */ }
}
app.on('second-instance', (_e, argv) => { const u = argv.find(a => a.startsWith(SCHEME + '://')); if (u) handleUrl(u); else focusWin(); });
app.on('open-url', (e, u) => { e.preventDefault(); handleUrl(u); });

const fromApp = e => !!(e.senderFrame && e.senderFrame.url.startsWith(ORIGIN));
ipcMain.on('fv:set-bg', (e, v) => { if (fromApp(e)) keepBg = !!v; });
ipcMain.on('fv:focus', e => { if (fromApp(e)) focusWin(); });

function makeTray() {
  if (tray) return;
  tray = new Tray(path.join(__dirname, 'icon.ico'));
  tray.setToolTip('ふたりボイス');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'ふたりボイスを開く', click: () => { if (win) focusWin(); else createWindow(); } },
    { type: 'separator' },
    { label: 'おわる', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { if (win) focusWin(); else createWindow(); });
}
app.on('before-quit', () => { quitting = true; });

ipcMain.handle('fv:google-login', async (e) => {
  if (!e.senderFrame || !e.senderFrame.url.startsWith(ORIGIN)) throw new Error('not allowed');
  if (pending) { clearTimeout(pending.timer); pending.reject(new Error('cancel')); pending = null; }
  const state = crypto.randomBytes(16).toString('hex');
  const p = new Promise((resolve, reject) => {
    pending = { state, resolve, reject, timer: setTimeout(() => { if (pending && pending.state === state) { pending = null; reject(new Error('timeout')); } }, 5 * 60 * 1000) };
  });
  await shell.openExternal(new URL('desktop-login.html?state=' + state, APP_URL).href);
  return p;
});

function setupSession() {
  const ses = session.defaultSession;
  const ok = new Set(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen', 'notifications']);
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(ok.has(perm) && String(details.requestingUrl || wc.getURL()).startsWith(ORIGIN)));
  ses.setPermissionCheckHandler((wc, perm, origin) => ok.has(perm) && String(origin || '').startsWith(ORIGIN));
  // 画面共有: どの画面・どの窓を見せるか、えらんでもらう
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const screens = sources.filter(s => s.id.startsWith('screen:'));
      const wins = sources.filter(s => s.id.startsWith('window:') && s.name && !/ふたりボイス|FutariVoice/.test(s.name)).slice(0, 8);
      const list = [...screens.map((s, i) => ({ s, label: screens.length > 1 ? `画面全体 ${i + 1}` : '画面全体' })), ...wins.map(s => ({ s, label: s.name.length > 40 ? s.name.slice(0, 40) + '…' : s.name }))];
      if (!list.length) return cb({});
      const r = await dialog.showMessageBox(win, { type: 'question', title: '画面を共有', message: 'どれをみんなに見せる？', buttons: [...list.map(x => x.label), 'やめる'], cancelId: list.length, noLink: true });
      if (r.response >= list.length) return cb({});
      const pick = list[r.response].s;
      cb(pick.id.startsWith('screen:') ? { video: pick, audio: 'loopback' } : { video: pick });
    } catch (err) { cb({}); }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 420, minHeight: 520,
    title: 'ふたりボイス', backgroundColor: '#313338', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.removeMenu();
  // ほかのサイトのリンクは、いつものブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN) && !url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => { if (isMain && code !== -3 && url.startsWith(ORIGIN)) win.loadFile(path.join(__dirname, 'offline.html'), { query: { u: APP_URL } }); });
  // ×をおしても、おわらずに右下（タスクトレイ）で待つ（メッセージや電話のおしらせを出すため）
  win.on('close', e => {
    if (quitting || !keepBg) return;
    e.preventDefault();
    win.hide();
    if (!hintShown) {
      hintShown = true;
      try { new Notification({ title: 'ふたりボイスは右下で待っているよ', body: 'メッセージや電話がきたら、おしらせするよ。おわるときは、右下のアイコンを右クリックして「おわる」をおしてね。', icon: path.join(__dirname, 'icon.ico') }).show(); } catch (err) { /* おしらせが出せなくても大丈夫 */ }
    }
  });
  win.on('closed', () => { win = null; });
  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  setupSession();
  createWindow();
  try { makeTray(); } catch (err) { keepBg = false; }
  const u = process.argv.find(a => a.startsWith(SCHEME + '://')); if (u) handleUrl(u);
});
app.on('window-all-closed', () => app.quit());
