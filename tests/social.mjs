// フレンド・個人チャット・個人通話・「ホームを見ても通話が切れない」をためす
//   ふつう: にせデータベース（tests/fakedb.mjs）で画面の動きをためす
//   FS_EMU=127.0.0.1:8085 のとき: 本物の Firestore エミュレーター（きまり firestore.rules も）でためす
import { launch, page, register, waitShown, waitFor, ok, done, sleep, dcBytes, audioBytes } from './helpers.mjs';
import { createFakeDB } from './fakedb.mjs';
const SITE = process.env.SITE || 'http://127.0.0.1:8080';
const FS = process.env.FS_EMU || '';
const URL = SITE + '/app/?server=' + (process.env.PEER || '127.0.0.1:9000') + '&emu=' + (process.env.EMU || '127.0.0.1:9099') + (FS ? '&fsemu=' + FS : '');
const fake = FS ? null : createFakeDB();
const setup = fake ? ctx => fake.attach(ctx) : null;
// パソコンのおしらせ（Notification）を、ためし用のにせものにする
const NOTE_STUB = `window.__notes = []; window.Notification = class { constructor(t, o){ o = o || {}; window.__notes.push([t, o.body, o.tag]); this.onclick = null; window.__lastNote = this; } close(){} static get permission(){ return 'granted'; } static requestPermission(){ return Promise.resolve('granted'); } };`;
const setupB = async ctx => { if (fake) await fake.attach(ctx); await ctx.addInitScript(NOTE_STUB); };
console.log(FS ? '本物の Firestore エミュレーターでためすよ' : 'にせデータベースでためすよ');
const errs = [];
const b = await launch();
const R = Math.floor(Math.random() * 1e6);
const ua = 'fa_' + R, ub = 'fb_' + R;
try {
  const A = await page(b, URL, 'A', errs, setup); await register(A, ua, 'pass1234', 'あおい');
  const B = await page(b, URL, 'B', errs, setupB); await register(B, ub, 'pass1234', 'ベル');
  await waitFor(A, '__fvF.uname === ' + JSON.stringify(ua), 15000, 'ID').catch(() => {});
  ok(await A.evaluate(n => __fvF.uname === n, ua), 'ユーザー名で登録した人は、そのままユーザーIDになる');

  // フレンド申請
  await A.click('#homeBtn'); await A.click('[data-ftab="add"]');
  await A.fill('#fAddIn', 'nobody_' + R); await A.click('#fAddForm button');
  ok(await waitFor(A, () => document.querySelector('#fbody .err').textContent.includes('見つからなかった'), 10000, 'いない人').then(() => true), 'いないユーザーIDには申請できない（見つからなかった）');
  await A.fill('#fAddIn', '@' + ub); await A.click('#fAddForm button');
  ok(await waitFor(A, () => document.querySelector('#fbody .okmsg').textContent.includes('送った'), 10000, '申請').then(() => true), 'ユーザーIDでフレンド申請を送れる');
  await waitFor(B, () => __fvF.inReq.length === 1, 15000, '申請がとどく');
  ok(await B.evaluate(() => !document.getElementById('homeBadge').classList.contains('hide')), '申請がとどくと、ホームのボタンに赤いしるしが出る');
  await B.click('#homeBtn'); await B.click('[data-ftab="req"]');
  ok(await B.evaluate(() => document.getElementById('fbody').textContent.includes('あおい')), '申請のタブに、送った人の名前が出る');
  await B.click('[data-acc]');
  await waitFor(A, () => __fvF.friends.size === 1, 15000, 'フレンドA');
  await waitFor(B, () => __fvF.friends.size === 1 && __fvF.inReq.length === 0, 15000, 'フレンドB');
  ok(true, 'OKするとフレンドになる（両方のリストに出る）');
  await A.click('[data-ftab="online"]');
  ok(await waitFor(A, () => document.querySelectorAll('#fbody .frow').length === 1 && document.getElementById('fbody').textContent.includes('オンライン'), 10000, 'オンライン').then(() => true), 'フレンドがオンラインかどうかわかる');

  // 個人チャット
  await A.click('#fbody [data-dmopen]');
  await waitShown(A, 'vDm');
  await A.fill('#dmIn', 'やっほー！ゲームしよ'); await A.press('#dmIn', 'Enter');
  await waitFor(B, () => !document.getElementById('homeBadge').classList.contains('hide') && document.getElementById('chList').textContent.includes('あおい'), 15000, 'DMのしるし');
  ok(true, '個人チャットがとどくと、しるしが出る');
  await B.click('#chList [data-dmopen]');
  ok(await waitFor(B, () => document.getElementById('dmMsgs').textContent.includes('やっほー！ゲームしよ'), 10000, 'DM本文').then(() => true), '個人チャットのメッセージが相手に見える');
  await B.fill('#dmIn', 'いいよ〜'); await B.press('#dmIn', 'Enter');
  ok(await waitFor(A, () => document.getElementById('dmMsgs').textContent.includes('いいよ〜'), 10000, 'DM返事').then(() => true), '返事もとどく');
  await waitFor(B, () => document.getElementById('homeBadge').classList.contains('hide'), 5000, '既読').catch(() => {});
  ok(await B.evaluate(() => document.getElementById('homeBadge').classList.contains('hide')), '読んだら、しるしが消える');

  // 個人通話
  await A.click('#btnCall');
  await waitShown(B, 'mRing', 15000);
  ok(true, '通話をかけると、相手に「電話だよ」が出る');
  await B.click('#ringYes');
  await waitFor(A, () => __fvDC.state === 'active', 25000, '通話A');
  await waitFor(B, () => __fvDC.state === 'active', 25000, '通話B');
  await sleep(2500);
  const ba = await dcBytes(A), bb = await dcBytes(B);
  ok(ba > 1000 && bb > 1000, `個人通話で、おたがいの声がとどく（${ba} / ${bb} バイト）`);
  ok(await A.evaluate(() => !document.getElementById('dcstat').classList.contains('hide')), '通話中は、左下に「通話中」が出る');
  await A.click('#dcMic');
  ok(await A.evaluate(() => __fvDC.state === 'active' && document.getElementById('dcMic').classList.contains('off')), '通話中にミュートできる');
  await A.click('#dcMic');
  await B.click('#dcHang');
  await waitFor(A, () => !__fvDC.state, 15000, '切る');
  ok(true, '片方が切ると、もう片方も切れる');

  // ことわる
  await B.click('#btnCall');
  await waitShown(A, 'mRing', 15000); await A.click('#ringNo');
  await waitFor(B, () => !__fvDC.state, 15000, 'ことわる');
  ok(true, '電話をことわると、かけた人の通話もおわる');

  // サーバーのボイス中にホームを見ても、ボイスは切れない
  await A.click('#addBtn'); await A.click('#goCreate'); await A.fill('#cName', 'ゲーム部'); await A.click('#cMake');
  const link = await A.inputValue('#invLink'); await A.keyboard.press('Escape');
  await B.click('#addBtn'); await B.fill('#addInv', link); await B.click('#addJoin button');
  await waitFor(A, () => [...__fv.peers.values()].some(P => P.ok), 25000, 'サーバー');
  await A.click('[data-vc="game"]'); await B.click('[data-vc="game"]');
  await waitFor(B, () => [...__fv.peers.values()].some(P => P.call && P.audio && P.audio.srcObject), 25000, 'ボイス');
  await A.click('#homeBtn'); await sleep(1500);
  await A.click('#chList [data-dmopen]'); await sleep(1500);
  ok(await A.evaluate(() => __fv.voice === 'game' && !!__fv.sid && [...__fv.peers.values()].some(P => P.ok)), 'ボイス中にホームや個人チャットを見ても、ボイスは切れない');
  const x = await audioBytes(B);
  ok(x.length === 1 && x[0].b > 1000, 'そのあいだも声はとどいている');
  await A.click('#vsGo');
  ok(await A.evaluate(() => __fv.view === 'voice'), '左下の「ボイス接続中」から、ボイスの画面にもどれる');

  // ボイス中に個人通話がきたら、出るとボイスからぬける
  await B.click('#homeBtn'); await B.click('[data-ftab="all"]'); await B.click('#fbody [data-call]');
  await waitShown(A, 'mRing', 15000); await A.click('#ringYes');
  await waitFor(A, () => __fvDC.state === 'active' && !__fv.voice, 25000, 'ボイス→個人通話');
  ok(true, 'ボイス中に個人通話に出ると、ボイスからぬけて個人通話になる');
  await A.click('#dcHang'); await waitFor(B, () => !__fvDC.state, 15000, '切る2');

  // パソコンのおしらせ
  await B.evaluate(() => { document.hasFocus = () => false; });
  await A.fill('#dmIn', 'おしらせテスト'); await A.press('#dmIn', 'Enter');
  await waitFor(B, () => __notes.some(n => n[0] === 'あおい' && String(n[1]).includes('おしらせテスト')), 10000, 'おしらせ');
  ok(true, 'ほかの窓（ゲームなど）を見ているときにメッセージがきたら、パソコンのおしらせが出る');
  await B.evaluate(() => { document.hasFocus = () => true; __fv.view = 'home'; window.__lastNote.onclick(); });
  ok(await B.evaluate(() => __fv.view === 'dm' && document.getElementById('dmMsgs').textContent.includes('おしらせテスト')), 'おしらせをおすと、その個人チャットが開く');
  await B.evaluate(() => { document.hasFocus = () => false; });
  await A.click('#btnCall');
  await waitFor(B, () => __notes.some(n => n[2] === 'call'), 10000, '電話のおしらせ');
  ok(true, '電話がきたときも、パソコンのおしらせが出る');
  await B.evaluate(() => { document.hasFocus = () => true; });
  await B.click('#ringNo'); await waitFor(A, () => !__fvDC.state, 15000, 'ことわる2');

  // フレンドをやめる
  await A.click('#homeBtn'); await A.click('[data-ftab="all"]'); await A.click('#fbody [data-unf]'); await A.click('#cfOk');
  await waitFor(B, () => __fvF.friends.size === 0, 15000, 'フレンドをやめる');
  ok(true, 'フレンドをやめると、両方のリストから消える');
} catch(e){ ok(false, String(e.message || e)); }
ok(errs.length === 0, 'ページのエラーなし ' + errs.slice(0, 3).join(' / '));
await b.close();
done();
