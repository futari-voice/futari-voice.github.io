// 練習用のサーバー（Firebaseエミュレーター＋ローカルPeerJS）で、4人＋5人目をためす
import { launch, page, register, waitShown, waitFor, okPeers, voiceLinks, audioBytes, ok, done, sleep } from './helpers.mjs';
const SITE = process.env.SITE || 'http://127.0.0.1:8080';
const URL = SITE + '/app/?server=' + (process.env.PEER || '127.0.0.1:9000') + '&emu=' + (process.env.EMU || '127.0.0.1:9099');
const errs = [];
const b = await launch();
const R = Math.floor(Math.random() * 1e6);
try {
  const A = await page(b, URL, 'A', errs);
  ok(await waitShown(A, 'login'), 'ログインしないと使えない（最初にログイン画面）');
  await register(A, 'a_' + R, 'pass1234', 'みつき');
  ok(true, 'ユーザー名とパスワードで登録できる');
  await A.click('#homeCreate'); await A.fill('#cName', 'テスト鯖'); await A.click('#cMake');
  const link = await A.inputValue('#invLink'); await A.keyboard.press('Escape');
  ok(link.startsWith(SITE + '/app/#invite-'), 'サーバーを作ると招待リンクが出る');
  await A.fill('#ci', 'みんな来てね'); await A.press('#ci', 'Enter');
  const others = [];
  for (const n of ['B', 'C', 'D']){ const p = await page(b, URL, n, errs); await register(p, n.toLowerCase() + '_' + R, 'pass1234', n); await p.fill('#homeInv', link); await p.click('#homeJoin button'); others.push(p); }
  for (const p of [A, ...others]) await waitFor(p, () => [...__fv.peers.values()].filter(P => P.ok && P.conn && P.conn.open).length === 3, 30000, '4人つながる');
  ok(true, '4人が招待リンクで入って、みんなつながる');
  ok(await waitFor(others[2], () => document.getElementById('msgs').textContent.includes('みんな来てね'), 8000, '履歴').then(() => true), 'あとから入った人にも前のチャットがとどく');
  const E = await page(b, URL, 'E', errs); await register(E, 'e_' + R, 'pass1234', 'E'); await E.fill('#homeInv', link); await E.click('#homeJoin button');
  ok(await waitFor(E, () => __fv.net === 'full', 25000, '5人目').then(() => true), '5人目は「いっぱい」でことわられる');
  await E.context().close();
  for (const p of [A, ...others]) await p.click('[data-vc="game"]');
  for (const p of [A, ...others]) await waitFor(p, () => [...__fv.peers.values()].filter(P => P.call && P.audio && P.audio.srcObject).length === 3, 25000, '4人で通話');
  await sleep(2500);
  let allSound = true; for (const p of [A, ...others]){ const x = await audioBytes(p); if (x.length !== 3 || x.some(y => y.b < 1000)) allSound = false; }
  ok(allSound, '4人で通話して、みんなにほかの3人の声がとどく');
  await others[0].click('#cbScreen');
  ok(await waitFor(A, () => { const v = document.getElementById('sv'); return v.srcObject && v.videoWidth > 0; }, 12000, '画面共有').then(() => true), '画面共有が見える');
  await A.click('#btnSet'); await A.click('#logoutBtn'); await A.click('#cfOk');
  await waitShown(A, 'login'); await A.fill('#lUser', 'a_' + R); await A.fill('#lPass', 'pass1234'); await A.click('#lGo');
  await waitShown(A, 'app');
  ok(await waitFor(A, () => !!__fv.sid && [...__fv.peers.values()].filter(P => P.ok).length === 3, 25000, 'もどる').then(() => true), 'ログアウトしてまたログインすると、サーバーにもどれる');
} catch(e){ ok(false, String(e.message || e)); }
ok(errs.length === 0, 'ページのエラーなし ' + errs.slice(0, 3).join(' / '));
await b.close();
done();
