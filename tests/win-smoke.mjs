// Windows版を起動して、窓が開いて、Webアプリとつながる部品があるかをたしかめる
import { _electron } from 'playwright';
const exe = process.argv[2];
const app = await _electron.launch({ executablePath: exe, args: [] });
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await new Promise(r => setTimeout(r, 6000));
const info = await win.evaluate(async () => ({ title: document.title, url: location.href, desktop: !!(window.fvDesktop && window.fvDesktop.googleLogin), login: !!document.getElementById('login'),
  version: window.fvDesktop && window.fvDesktop.appVersion ? await window.fvDesktop.appVersion() : '', upd: !!(window.fvDesktop && window.fvDesktop.installUpdate) }));
console.log(JSON.stringify(info));
await win.screenshot({ path: 'win-smoke.png' });
await app.close();
const want = process.env.WANT_VERSION || '';
const pass = info.desktop;   // 窓が開いて、Googleログインのお手伝い部品がつながっていればOK（サイトがまだ公開前でもためせる）
const upd = info.upd && /^\d+\.\d+\.\d+$/.test(info.version) && (!want || info.version === want);
console.log(pass ? 'PASS Windows版が起動した' : 'FAIL Windows版がうまく起動しない');
console.log(upd ? 'PASS アップデートのしくみがある（いまのバージョン ' + info.version + '）' : 'FAIL アップデートのしくみがない（' + info.version + '）');
process.exit(pass && upd ? 0 : 1);
