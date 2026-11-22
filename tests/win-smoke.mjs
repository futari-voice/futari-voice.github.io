// Windows版を起動して、窓が開いて、Webアプリとつながる部品があるかをたしかめる
import { _electron } from 'playwright';
const exe = process.argv[2];
const app = await _electron.launch({ executablePath: exe, args: [] });
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await new Promise(r => setTimeout(r, 6000));
const info = await win.evaluate(() => ({ title: document.title, url: location.href, desktop: !!(window.fvDesktop && window.fvDesktop.googleLogin), login: !!document.getElementById('login') }));
console.log(JSON.stringify(info));
await win.screenshot({ path: 'win-smoke.png' });
await app.close();
const pass = info.desktop;   // 窓が開いて、Googleログインのお手伝い部品がつながっていればOK（サイトがまだ公開前でもためせる）
console.log(pass ? 'PASS Windows版が起動した' : 'FAIL Windows版がうまく起動しない');
process.exit(pass ? 0 : 1);
