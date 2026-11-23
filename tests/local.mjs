// サーバー（データベースに置く・メンバー何人でもOK）とボイスをためす
//   ふつう: にせデータベース（tests/fakedb.mjs）＋ローカルPeerJS
//   FS_EMU=127.0.0.1:8085 のとき: 本物の Firestore エミュレーター（きまり firestore.rules も）でためす
import { launch, page, register, waitShown, waitFor, audioBytes, ok, done, sleep, shown } from './helpers.mjs';
import { createFakeDB } from './fakedb.mjs';
const SITE = process.env.SITE || 'http://127.0.0.1:8080';
const FS = process.env.FS_EMU || '';
const URL = SITE + '/app/?server=' + (process.env.PEER || '127.0.0.1:9000') + '&emu=' + (process.env.EMU || '127.0.0.1:9099') + (FS ? '&fsemu=' + FS : '');
const fake = FS ? null : createFakeDB();
const setup = fake ? ctx => fake.attach(ctx) : null;
console.log(FS ? '本物の Firestore エミュレーターでためすよ' : 'にせデータベースでためすよ');
const errs = [];
const b = await launch();
const R = Math.floor(Math.random() * 1e6);
const shot = async (P, n) => { if (process.env.SHOTS) await P.screenshot({ path: process.env.SHOTS + '/' + n + '.png' }); };
const VO = n => [...__fv.peers.values()].filter(P => P.ok && P.call && P.audio && P.audio.srcObject).length === n;
try {
  const A = await page(b, URL, 'A', errs, setup);
  ok(await waitShown(A, 'login'), 'ログインしないと使えない（最初にログイン画面）');
  await register(A, 'a_' + R, 'pass1234', 'みつき');
  ok(true, 'ユーザー名とパスワードで登録できる');
  await A.click('#homeCreate'); await A.fill('#cName', 'テスト鯖'); await A.click('#cMake');
  await waitShown(A, 'mInvite');
  const link = await A.inputValue('#invLink'); await A.keyboard.press('Escape');
  ok(/\/app\/#join-[a-z0-9]{10,24}\.[a-z0-9]{8,24}$/.test(link), 'サーバーを作ると招待リンクが出る');
  const sid = link.match(/join-([a-z0-9]+)\./)[1];
  await waitFor(A, () => !!__fv.sid && document.getElementById('srvList').textContent.includes('テスト鯖'), 10000, 'サーバー');
  ok(true, '左のメニューに、名前つきのサーバーカードが出る');
  await A.fill('#ci', 'みんな来てね'); await A.press('#ci', 'Enter');
  await waitFor(A, () => document.getElementById('msgs').textContent.includes('みんな来てね'), 10000, '送信');

  // 5人が招待リンクで入る（前は4人まで）
  const others = [];
  for (const n of ['B', 'C', 'D', 'E']){
    const p = await page(b, URL, n, errs, setup); await register(p, n.toLowerCase() + '_' + R, 'pass1234', n);
    await p.fill('#homeInv', link); await p.click('#homeJoin button'); others.push(p);
  }
  const [B, C, D, E] = others;
  for (const p of others) await waitFor(p, s => __fv.sid === s, 20000, '入る', sid);
  ok(true, '招待リンクで4人が入れる（作った人とあわせて5人）');
  await waitFor(A, s => (__fvSV.get(s) || {members:[]}).members.length === 5, 15000, '5人', sid);
  ok(true, 'サーバーのメンバーは5人（4人より多くてもOK）');
  ok(await waitFor(E, () => document.getElementById('msgs').textContent.includes('みんな来てね'), 10000, '履歴').then(() => true), 'あとから入った人にも前のチャットが見える');
  ok(await waitFor(A, () => document.getElementById('msgs').textContent.includes('がサーバーに入ったよ'), 10000, '入ったよ').then(() => true), '「○○がサーバーに入ったよ」が出る');

  // 古い招待リンク・でたらめなリンク
  const X = await page(b, URL, 'X', errs, setup); await register(X, 'x_' + R, 'pass1234', 'X');
  await X.fill('#homeInv', SITE + '/app/#invite-abcdefghijkl.xyz'); await X.click('#homeJoin button');
  ok(await waitFor(X, () => document.getElementById('homeErr').textContent.includes('前の'), 5000, '古いリンク').then(() => true), '前の（ふたりボイスの）招待リンクだと、教えてくれる');
  if (FS){
    await X.fill('#homeInv', SITE + '/app/#join-' + sid + '.wrongcode123'); await X.click('#homeJoin button');
    ok(await waitFor(X, () => document.getElementById('homeErr').textContent.includes('入れなかった'), 15000, 'まちがいコード').then(() => true), '招待コードがまちがっていると入れない（データベースがことわる）');
    const peek = await X.evaluate(async s => { try { await __fvDBX().get('servers/' + s); return 'read'; } catch(e){ return 'denied'; } }, sid);
    ok(peek === 'denied', 'メンバーでない人は、サーバーの中を見られない');
  }
  await X.context().close();

  // ボイス：Eは入らずに、ボイスにいる人が見えるか
  for (const p of [A, B, C, D]){ await p.click('[data-vc="game"]'); await p.click('#vjoin [data-act="joinvc"]'); }
  const vstate = () => ({voice:__fv.voice, net:__fv.net, seat:__fv.seat, open:!!(__fv.peer && __fv.peer.open), peers:[...__fv.peers.values()].map(P => P.seat + (P.ok ? 'ok' : '') + (P.call ? 'c' : '') + (P.audio && P.audio.srcObject ? 'a' : '')), pend:Object.keys(__fv.pend).length});
  for (const p of [A, B, C, D]) await waitFor(p, VO, 30000, '4人で通話', 3).catch(async e => { for (const q of [A, B, C, D]) console.log('  ', q._n, JSON.stringify(await q.evaluate(vstate))); throw e; });
  ok(true, '4人がボイスに入って、みんなつながる');
  await waitFor(E, () => document.querySelectorAll('[data-vc="game"] .vwho .av').length >= 3, 15000, 'ボイスにいる人');
  ok(true, 'ボイスに入っていない人にも、ボイスにいる人が見える');
  await E.click('[data-vc="game"]'); await E.click('#vjoin [data-act="joinvc"]');
  for (const p of [A, B, C, D, E]) await waitFor(p, VO, 30000, '5人で通話', 4);
  await sleep(2500);
  let allSound = true; for (const p of [A, ...others]){ const x = await audioBytes(p); if (x.length !== 4 || x.some(y => y.b < 1000)) allSound = false; }
  ok(allSound, '5人で通話して、みんなにほかの4人の声がとどく');
  await shot(A, 'srv-voice');
  await B.click('#cbScreen');
  ok(await waitFor(A, () => { const v = document.getElementById('sv'); return v.srcObject && v.videoWidth > 0; }, 15000, '画面共有').then(() => true), '画面共有が見える');
  await shot(A, 'srv-screen');
  await E.click('#cbLeave');
  for (const p of [A, B, C, D]) await waitFor(p, VO, 20000, '1人ぬける', 3);
  ok(true, 'ボイスから出ると、ほかの人の画面からも消える');

  // チャンネル・未読・作った人だけができること
  ok(await A.evaluate(() => !!document.querySelector('#chList .chip.add')) && await B.evaluate(() => !document.querySelector('#chList .chip.add')), 'チャンネルを作るボタンは、作った人にだけ出る');
  await A.click('#chList .chip.add'); await A.fill('#nName', '攻略メモ'); await A.click('#nMake');
  await waitFor(A, () => !!document.querySelector('#chList .chip.on') && document.querySelector('#chList .chip.on').textContent.includes('攻略メモ'), 10000, '新チャンネル');
  await waitFor(B, () => document.getElementById('chList').textContent.includes('攻略メモ'), 10000, '新チャンネルB');
  ok(true, '作ったチャンネルが、みんなに出る');
  await A.fill('#ci', 'ボスは右から'); await A.press('#ci', 'Enter');
  ok(await waitFor(C, () => !!document.querySelector('#chList .chip.unread'), 10000, '未読').then(() => true), 'ほかのチャンネルに新しいメッセージがくると、しるしが出る');
  await C.click('#chList .chip.unread');
  ok(await waitFor(C, () => document.getElementById('msgs').textContent.includes('ボスは右から') && !document.querySelector('#chList .chip.unread'), 10000, '読む').then(() => true), 'そのチャンネルを開くと読めて、しるしが消える');
  await shot(C, 'srv-text');

  // 外す・ぬける
  await A.evaluate(() => { if (!document.getElementById('app').classList.contains('mem-on')) document.getElementById('btnMembers').click(); });
  await waitFor(A, () => document.querySelectorAll('#mlist [data-kick]').length === 4, 10000, 'メンバー一覧');
  await A.evaluate(name => { const r = [...document.querySelectorAll('#mlist .mrow')].find(x => x.textContent.includes(name)); r.querySelector('[data-kick]').click(); }, 'E');
  await A.click('#cfOk');
  ok(await waitFor(E, () => !__fv.sid && !__fvSV.size, 15000, '外された').then(() => true), '作った人は、メンバーを外せる（外された人のリストから消える）');
  await D.click('#btnSrvSet'); await D.click('#sQuit'); await D.click('#cfOk');
  await waitFor(D, () => !__fvSV.size, 15000, 'ぬける');
  ok(await waitFor(A, s => __fvSV.get(s).members.length === 3, 15000, '3人', sid).then(() => true), 'サーバーからぬけられる');

  // ログアウトしてまたログイン
  await A.click('#btnSet'); await A.click('#logoutBtn'); await A.click('#cfOk');
  await waitShown(A, 'login'); await A.fill('#lUser', 'a_' + R); await A.fill('#lPass', 'pass1234'); await A.click('#lGo');
  await waitShown(A, 'app');
  ok(await waitFor(A, s => __fvSV.has(s) && document.getElementById('srvList').textContent.includes('テスト鯖'), 20000, 'もどる', sid).then(() => true), 'ログアウトしてまたログインしても、サーバーが残っている（別の端末でも同じ）');

  // スマホの画面（下のタブ）
  const ctx = await b.newContext({ permissions: ['microphone'], viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  if (fake) await fake.attach(ctx);
  const P = await ctx.newPage(); P._n = 'スマホ'; P.on('pageerror', e => errs.push('スマホ: ' + e.message));
  await P.goto(URL); await waitShown(P, 'login');
  await P.fill('#lUser', 'b_' + R); await P.fill('#lPass', 'pass1234'); await P.click('#lGo');
  await waitFor(P, () => !document.getElementById('app').classList.contains('hide') || !document.getElementById('welcome').classList.contains('hide'), 15000, 'ログイン');
  if (await shown(P, 'welcome')) await P.click('#wf button[type=submit]');
  await waitShown(P, 'app');
  ok(await P.evaluate(() => getComputedStyle(document.getElementById('tabbar')).display !== 'none'), 'スマホでは、下に「ホーム／サーバー／フレンド／設定」のタブが出る');
  await shot(P, 'm-home');
  await P.click('#tabbar [data-mtab="srv"]');
  await waitFor(P, () => !!document.querySelector('#srvList [data-sid]') && document.querySelector('#srvList [data-sid]').offsetParent !== null, 15000, 'サーバータブ');
  await shot(P, 'm-srv');
  await P.click('#srvList [data-sid]');
  ok(await waitFor(P, () => document.getElementById('app').classList.contains('deep') && getComputedStyle(document.getElementById('tabbar')).display === 'none' && !document.getElementById('btnBack').classList.contains('hide'), 10000, '中に入る').then(() => true), 'サーバーを開くと画面いっぱいになって、「もどる」が出る');
  await shot(P, 'm-text');
  await P.click('#btnBack');
  ok(await P.evaluate(() => !document.getElementById('app').classList.contains('deep') && document.querySelector('#tabbar [data-mtab="srv"]').classList.contains('on')), '「もどる」でサーバーの一覧にもどる');
  await P.click('#tabbar [data-mtab="friends"]');
  ok(await P.evaluate(() => !document.getElementById('vHome').classList.contains('hide') && document.getElementById('vHome').offsetParent !== null), 'フレンドのタブで、フレンドの画面が出る');
  await ctx.close();
} catch(e){ ok(false, String(e.message || e)); }
ok(errs.length === 0, 'ページのエラーなし ' + errs.slice(0, 3).join(' / '));
await b.close();
done();
