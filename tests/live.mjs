// 本物のサイト・本物のFirebase（ログイン＋データベース）・本物のPeerJSサーバーでためす
// テスト用アカウントとデータは、最後に消す
import { launch, page, register, waitFor, waitShown, audioBytes, dcBytes, ok, done, sleep } from './helpers.mjs';
const SITE = (process.argv[2] || process.env.SITE || '').replace(/\/$/, '');
if (!SITE) { console.log('使い方: node tests/live.mjs https://xxxx.github.io'); process.exit(2); }
const errs = [];
const b = await launch();
const R = Date.now().toString(36);
const users = [];
const warn = m => console.log('WARN ' + m);
async function cleanup(){
  // 自分のメッセージ → 個人チャット・通話・フレンド → プロフィール・ユーザーID → アカウント の順に消す
  for (const p of users) try { await p.evaluate(async () => {
    const F = window.__fvF, D = window.__fvDBX && window.__fvDBX();
    if (D && F && F.fuid){
      for (const m of F.dmMsgs || []) if (m.from === F.fuid && F.dm){ const pid = F.fuid < F.dm ? F.fuid + '_' + F.dm : F.dm + '_' + F.fuid; await D.del('dms/' + pid + '/msgs/' + m.id).catch(() => {}); }
      // サーバー：自分のメッセージ・ボイスのしるし・招待の記録を消して、作ったサーバーは消す、入ったサーバーはぬける
      const S = window.__fv, SV = window.__fvSV;
      if (S && S.sid) for (const m of S.msgs || []) if (m.uid === F.fuid) await D.del('servers/' + S.sid + '/ch/' + S.textCh + '/msgs/' + m.id).catch(() => {});
      for (const sv of (SV ? [...SV.values()] : [])){
        await D.del('servers/' + sv.id + '/voice/' + F.fuid).catch(() => {});
        await D.del('joins/' + F.fuid + '_' + sv.id).catch(() => {});
        if (sv.owner === F.fuid) await D.del('servers/' + sv.id).catch(() => {});
        else await D.set('servers/' + sv.id, {members:{__rem:[F.fuid]}}, true).catch(() => {});
      }
    }
  }); } catch(e){}
  for (const p of users) try { await p.evaluate(async () => {
    const F = window.__fvF, D = window.__fvDBX && window.__fvDBX();
    if (D && F && F.fuid){
      for (const [fid, f] of F.friends){ await D.del('dms/' + f.pid).catch(() => {}); await D.del('calls/' + f.pid).catch(() => {}); await D.del('friendships/' + f.pid).catch(() => {}); }
      for (const r of F.inReq) await D.del('requests/' + r.id).catch(() => {});
      for (const r of F.outReq) await D.del('requests/' + r.id).catch(() => {});
      if (F.uname) await D.del('unames/' + F.uname).catch(() => {});
      await D.del('users/' + F.fuid).catch(() => {});
    }
    const a = window.__fvAuth && window.__fvAuth(); if (a && a.currentUser) await window.FB.deleteUser(a.currentUser);
  }); } catch(e){}
}
try {
  const s = await (await b.newContext()).newPage(); await s.goto(SITE + '/');
  ok((await s.textContent('h1')).includes('サーバー'), 'ダウンロードサイトが開く');
  const links = await s.$$eval('.dlbtn', a => a.map(x => x.href));
  ok(links.length === 2 && links.every(h => h.startsWith('https://github.com/')), 'ダウンロードボタンがGitHubのリリースを指している');
  const ver = await fetch(SITE + '/version.json', {cache:'no-store'}).then(r => r.json()).catch(() => null);
  ok(!!(ver && ver.build > 0 && ver.android && ver.windows), 'アップデート用のファイル（version.json）がある（' + (ver ? ver.name : 'なし') + '）');
  if (ver && ver.android){
    const h = await fetch(ver.android.url, {method:'HEAD', redirect:'follow'}).catch(() => null);
    ok(!!(h && h.ok), 'アップデート用のAPKをダウンロードできる');
  }
  if (new URL(SITE).pathname.replace(/\/$/, '') === ''){
    const al = await fetch(SITE + '/.well-known/assetlinks.json').then(r => r.json()).catch(() => null);
    ok(Array.isArray(al) && al[0].target.package_name === 'app.futarivoice.twa', 'Android用の確認ファイル（assetlinks.json）がある');
  }

  // サーバー（ふつう／中継サーバーだけ）
  for (const relay of [false, true]){
    const url = SITE + '/app/?debug=1&nonews=1' + (relay ? '&relay=1' : '');
    const tag = relay ? '（中継サーバーだけで）' : '';
    try {
      const A = await page(b, url, 'A', errs); users.push(A);
      await register(A, 'ci_a_' + R + (relay ? 'r' : ''), 'ci-pass-' + R, 'テストA');
      await A.click('#homeCreate'); await A.click('#cMake');
      await waitShown(A, 'mInvite');
      const link = await A.inputValue('#invLink'); await A.keyboard.press('Escape');
      const B = await page(b, url, 'B', errs); users.push(B);
      await register(B, 'ci_b_' + R + (relay ? 'r' : ''), 'ci-pass-' + R, 'テストB');
      await B.fill('#homeInv', link); await B.click('#homeJoin button');
      await waitFor(B, () => !!__fv.sid, 30000, '入る' + tag);
      ok(true, '本物のデータベースで、招待リンクからサーバーに入れる' + tag);
      if (!relay){
        await B.fill('#ci', 'こんにちは' + R); await B.press('#ci', 'Enter');
        ok(await waitFor(A, r => document.getElementById('msgs').textContent.includes('こんにちは' + r), 20000, 'サーバーのチャット', R).then(() => true), '本物のデータベースで、サーバーのチャットがとどく');
      }
      for (const p of [A, B]){ await p.click('[data-vc="game"]'); await p.click('#vjoin [data-act="joinvc"]'); }
      await waitFor(B, () => [...__fv.peers.values()].some(P => P.call && P.audio && P.audio.srcObject), 40000, '通話' + tag);
      await sleep(3000);
      const x = await audioBytes(B);
      ok(x.length === 1 && x[0].b > 1000, '本物のネットで声がとどく' + tag + `（${x[0] ? x[0].b : 0} バイト${x[0] && x[0].relay ? '・中継あり' : ''}）`);
    } catch(e){
      if (relay) warn('中継サーバー（TURN）だけではつながらなかった：' + (e.message || e) + '（PeerJSの無料の中継サーバーが止まっているかも）');
      else throw e;
    }
  }

  // フレンド・個人チャット・個人通話（本物のデータベースと、きまり）
  const url = SITE + '/app/?debug=1&nonews=1';
  const ua = 'ci_fa_' + R, ub = 'ci_fb_' + R;
  const A = await page(b, url, 'FA', errs); users.push(A); await register(A, ua, 'ci-pass-' + R, 'フレンドA');
  const B = await page(b, url, 'FB', errs); users.push(B); await register(B, ub, 'ci-pass-' + R, 'フレンドB');
  await waitFor(A, '__fvF.uname === ' + JSON.stringify(ua), 20000, 'ユーザーID');
  ok(true, '本物のデータベースで、ユーザーIDが決まる');
  await waitFor(B, '__fvF.uname === ' + JSON.stringify(ub), 20000, 'ユーザーIDB');
  await A.click('#homeBtn'); await A.click('[data-ftab="add"]');
  await A.fill('#fAddIn', ub); await A.click('#fAddForm button');
  await waitFor(B, () => __fvF.inReq.length === 1, 20000, '申請');
  ok(true, '本物のデータベースで、フレンド申請がとどく');
  await B.click('#homeBtn'); await B.click('[data-ftab="req"]'); await B.click('[data-acc]');
  await waitFor(A, () => __fvF.friends.size === 1, 20000, 'フレンド');
  ok(true, '本物のデータベースで、フレンドになれる');
  await A.click('[data-ftab="all"]'); await A.click('#fbody [data-dmopen]');
  await A.fill('#dmIn', 'テストのメッセージ ' + R); await A.press('#dmIn', 'Enter');
  await waitFor(B, () => [...__fvF.dms.values()].some(d => d.last && d.last.text && d.last.text.startsWith('テストのメッセージ')), 20000, 'DM');
  await B.click('#chList [data-dmopen]');
  await waitFor(B, () => document.getElementById('dmMsgs').textContent.includes('テストのメッセージ'), 15000, 'DM本文');
  ok(true, '本物のデータベースで、個人チャットがとどく');
  await A.click('#btnCall');
  await waitShown(B, 'mRing', 20000); await B.click('#ringYes');
  await waitFor(A, () => __fvDC.state === 'active', 40000, '個人通話');
  await sleep(3000);
  const ba = await dcBytes(A), bb = await dcBytes(B);
  ok(ba > 1000 && bb > 1000, `本物のネットで、個人通話の声がとどく（${ba} / ${bb} バイト）`);
  await A.click('#dcHang'); await waitFor(B, () => !__fvDC.state, 20000, '切る');
  ok(true, '本物のネットで、個人通話を切れる');
} catch(e){ ok(false, String(e.message || e)); }
await cleanup();
ok(errs.length === 0, 'ページのエラーなし ' + errs.slice(0, 3).join(' / '));
await b.close();
done();
