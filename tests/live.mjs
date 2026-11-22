// 本物のサイト・本物のFirebase・本物のPeerJSサーバーでためす（テスト用アカウントは最後に消す）
import { launch, page, register, waitFor, audioBytes, ok, done, sleep } from './helpers.mjs';
const SITE = (process.argv[2] || process.env.SITE || '').replace(/\/$/, '');
if (!SITE) { console.log('使い方: node tests/live.mjs https://xxxx.web.app'); process.exit(2); }
const errs = [];
const b = await launch();
const R = Date.now().toString(36);
const users = [];
async function cleanup(){ for (const p of users) try { await p.evaluate(async () => { const a = window.__fvAuth && window.__fvAuth(); if (a && a.currentUser) await window.FB.deleteUser(a.currentUser); }); } catch(e){} }
try {
  const s = await (await b.newContext()).newPage(); await s.goto(SITE + '/');
  ok((await s.textContent('h1')).includes('サーバー'), 'ダウンロードサイトが開く');
  const links = await s.$$eval('.dlbtn', a => a.map(x => x.href));
  ok(links.length === 2 && links.every(h => h.startsWith('https://github.com/')), 'ダウンロードボタンがGitHubのリリースを指している');
  if (new URL(SITE).pathname.replace(/\/$/, '') === ''){
    const al = await fetch(SITE + '/.well-known/assetlinks.json').then(r => r.json()).catch(() => null);
    ok(Array.isArray(al) && al[0].target.package_name === 'app.futarivoice.twa', 'Android用の確認ファイル（assetlinks.json）がある');
  }
  for (const relay of [false, true]){
    const url = SITE + '/app/?debug=1' + (relay ? '&relay=1' : '');
    const tag = relay ? '（中継サーバーだけで）' : '';
    const A = await page(b, url, 'A', errs); users.push(A);
    await register(A, 'ci_a_' + R + (relay ? 'r' : ''), 'ci-pass-' + R, 'テストA');
    await A.click('#homeCreate'); await A.click('#cMake');
    const link = await A.inputValue('#invLink'); await A.keyboard.press('Escape');
    const B = await page(b, url, 'B', errs); users.push(B);
    await register(B, 'ci_b_' + R + (relay ? 'r' : ''), 'ci-pass-' + R, 'テストB');
    await B.fill('#homeInv', link); await B.click('#homeJoin button');
    await waitFor(B, () => [...__fv.peers.values()].some(P => P.ok && P.conn && P.conn.open), 40000, 'つながる' + tag);
    ok(true, '本物のネットで、招待リンクから入ってつながる' + tag);
    await A.click('[data-vc="game"]'); await B.click('[data-vc="game"]');
    await waitFor(B, () => [...__fv.peers.values()].some(P => P.call && P.audio && P.audio.srcObject), 40000, '通話' + tag);
    await sleep(3000);
    const x = await audioBytes(B);
    ok(x.length === 1 && x[0].b > 1000, '本物のネットで声がとどく' + tag + `（${x[0] ? x[0].b : 0} バイト${x[0] && x[0].relay ? '・中継あり' : ''}）`);
  }
} catch(e){ ok(false, String(e.message || e)); }
await cleanup();
ok(errs.length === 0, 'ページのエラーなし ' + errs.slice(0, 3).join(' / '));
await b.close();
done();
