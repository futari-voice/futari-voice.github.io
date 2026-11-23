// フレンド・個人チャット・個人通話・「ホームを見ても通話が切れない」をためす
//   ふつう: にせデータベース（tests/fakedb.mjs）で画面の動きをためす
//   FS_EMU=127.0.0.1:8085 のとき: 本物の Firestore エミュレーター（きまり firestore.rules も）でためす
import { launch, page, register, waitShown, waitFor, ok, done, sleep, dcBytes, audioBytes, shown } from './helpers.mjs';
import { createFakeDB, TEST_ADMIN_PASS } from './fakedb.mjs';
const SITE = process.env.SITE || 'http://127.0.0.1:8080';
const FS = process.env.FS_EMU || '';
const URL = SITE + '/app/?server=' + (process.env.PEER || '127.0.0.1:9000') + '&emu=' + (process.env.EMU || '127.0.0.1:9099') + (FS ? '&fsemu=' + FS : '');
const fake = FS ? null : createFakeDB();
const geo = async ctx => { await ctx.grantPermissions(['microphone', 'camera', 'geolocation']); await ctx.setGeolocation({latitude:35.68123, longitude:139.76712}); };
const setup = async ctx => { if (fake) await fake.attach(ctx); await geo(ctx); };
// パソコンのおしらせ（Notification）を、ためし用のにせものにする
const NOTE_STUB = `window.__notes = []; window.Notification = class { constructor(t, o){ o = o || {}; window.__notes.push([t, o.body, o.tag]); this.onclick = null; window.__lastNote = this; } close(){} static get permission(){ return 'granted'; } static requestPermission(){ return Promise.resolve('granted'); } };`;
const setupB = async ctx => { if (fake) await fake.attach(ctx); await geo(ctx); await ctx.addInitScript(NOTE_STUB); };
console.log(FS ? '本物の Firestore エミュレーターでためすよ' : 'にせデータベースでためすよ');
const errs = [];
const b = await launch();
const R = Math.floor(Math.random() * 1e6);
const ua = 'fa_' + R, ub = 'fb_' + R;
try {
  const shot = async (P, n) => { if (process.env.SHOTS) await P.screenshot({ path: process.env.SHOTS + '/' + n + '.png' }); };
  const A = await page(b, URL, 'A', errs, setup); await register(A, ua, 'pass1234', 'あおい');
  await sleep(800); await shot(A, 'guide');
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

  // いる場所を送る
  await A.click('#dmLoc'); await A.click('#cfOk');
  ok(await waitFor(B, () => !!document.querySelector('#dmMsgs .loc iframe[src*="marker=35.68123,139.76712"]'), 15000, '場所').then(() => true), 'いる場所を送ると、相手に地図が出る');
  ok(await B.evaluate(() => [...__fvF.dms.values()].some(d => d.last && d.last.text === '📍 いる場所')), 'チャットの一覧には「📍 いる場所」と出る');
  await sleep(1500); await shot(B, 'location');

  // ビデオ通話・画面共有
  await A.click('#btnVideo');
  await waitShown(B, 'mRing', 15000); await B.click('#ringYes');
  await waitFor(A, () => __fvDC.state === 'active', 25000, 'ビデオ通話A');
  ok(await A.evaluate(() => !!__fvDC.camStream && !document.getElementById('dcMeBox').classList.contains('hide')), 'ビデオでかけると、自分のカメラが映る');
  await waitFor(B, () => !document.getElementById('dcCamBox').classList.contains('hide') && document.getElementById('dcRemoteCam').videoWidth > 0, 15000, '相手のカメラ');
  ok(true, '相手のカメラの映像がとどく（' + await B.evaluate(() => document.getElementById('dcRemoteCam').videoWidth + 'x' + document.getElementById('dcRemoteCam').videoHeight) + '）');
  console.log('  SDPの長さ: ' + await A.evaluate(() => __fvDC.pc.localDescription.sdp.length) + ' / ' + await B.evaluate(() => __fvDC.pc.localDescription.sdp.length));
  await B.click('#dcScreen');
  await waitFor(A, () => !document.getElementById('dcScrBox').classList.contains('hide') && document.getElementById('dcRemoteScr').videoWidth > 0, 15000, '画面共有');
  ok(true, '個人通話で画面共有ができる（' + await A.evaluate(() => document.getElementById('dcRemoteScr').videoWidth + 'x' + document.getElementById('dcRemoteScr').videoHeight) + '）');
  await shot(A, 'video-pc');
  await A.setViewportSize({ width: 390, height: 800 }); await sleep(600); await shot(A, 'video-phone');
  await A.setViewportSize({ width: 1280, height: 800 }); await sleep(300);
  await A.click('#dcBig');
  await sleep(400); await shot(A, 'video-big');
  ok(await A.evaluate(() => document.getElementById('dcPanel').classList.contains('big')), '画面共有を大きく見られる');
  await A.click('#dcBig');
  await B.click('#dcCam');
  await waitFor(A, () => !document.getElementById('dcCamBox').classList.contains('hide') && document.getElementById('dcRemoteCam').videoWidth > 0, 15000, 'Bのカメラ');
  ok(true, 'あとからカメラをつけても、相手に映る');
  await A.click('#dcCam');
  await waitFor(B, () => document.getElementById('dcCamBox').classList.contains('hide'), 10000, 'カメラを止める');
  ok(true, 'カメラを止めると、相手の画面からも消える');
  ok((await dcBytes(A)) > 1000, '声もとどいている');
  await A.click('#dcHang'); await waitFor(B, () => !__fvDC.state && !__fvDC.camStream && !__fvDC.scrStream, 15000, 'ビデオを切る');
  ok(true, '切ると、カメラも画面共有も止まる');

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

  // 管理者パネル：パスワードを入れると開いて、全員におしらせを送れる
  await A.click('#btnSet'); await waitShown(A, 'mSet');
  await A.click('#admOpen'); await waitShown(A, 'mAdmin');
  ok(await shown(A, 'admLock') && !(await shown(A, 'admMain')), '設定の「管理者」から開くと、はじめはパスワードの画面');
  await A.fill('#admPass', 'guess-0000'); await A.click('#admGo');
  await waitFor(A, () => document.getElementById('admErr').textContent.includes('ちがう'), 15000, 'まちがったパスワード');
  ok(!(await shown(A, 'admMain')), 'パスワードがちがうと開かない');
  await A.fill('#admPass', TEST_ADMIN_PASS); await A.click('#admGo');
  await waitShown(A, 'admMain', 15000);
  ok(true, '正しいパスワードで管理者パネルが開く');
  await waitFor(A, () => /\d+人/.test(document.getElementById('stUsers').textContent) && /\d+人/.test(document.getElementById('stOnline').textContent), 15000, '人数');
  ok(true, '登録している人・オンラインの人数が見える（' + await A.textContent('#stUsers') + ' / ' + await A.textContent('#stOnline') + '）');
  await B.evaluate(() => { document.hasFocus = () => false; });
  await A.click('#admTpl');
  await waitFor(A, () => document.getElementById('admTitle').value.includes('新しいバージョン'), 5000, 'ひな形');
  ok(await A.evaluate(() => __fvADM.kind === 'update'), '「アップデートのおしらせを書く」で、ひな形が入る');
  await A.fill('#admTitle', 'テストのおしらせ'); await A.fill('#admText', 'アップデートしてね\nよろしく');
  await A.click('#admSend');
  ok(await A.evaluate(() => document.getElementById('admSend').textContent.includes('本当に')), 'まちがえないように、送る前にもう一回たしかめる');
  await A.click('#admSend');
  await waitShown(B, 'mNews', 15000);
  ok(await B.evaluate(() => { const t = document.getElementById('newsList').textContent; return t.includes('テストのおしらせ') && t.includes('よろしく') && t.includes('アップデート'); }), '全員の画面に、おしらせが出る');
  await waitFor(B, () => __notes.some(n => n[2] === 'news' && String(n[0]).includes('テストのおしらせ')), 10000, 'おしらせの通知');
  ok(true, 'ほかの窓を見ているときは、パソコンのおしらせもとどく');
  await B.evaluate(() => { document.hasFocus = () => true; });
  await sleep(300); await shot(B, 'news');
  await B.click('#newsOk');
  ok(!(await shown(B, 'mNews')), 'OKをおすと、とじる');
  await waitFor(A, () => document.getElementById('admList').textContent.includes('テストのおしらせ'), 10000, '送ったおしらせ');
  ok(!(await shown(A, 'mNews')), '送った人の画面には出ない（一覧に出る）');
  await shot(A, 'admin');
  await B.evaluate(() => document.getElementById('newsAll').click());
  ok(await B.evaluate(() => !document.getElementById('mNews').classList.contains('hide') && document.getElementById('newsTitle').textContent.includes('これまで') && document.getElementById('newsList').textContent.includes('テストのおしらせ')), '設定から、これまでのおしらせを見られる');
  await B.click('#newsOk');
  // 管理者でない人は、送れない・パスワードなしでは入れない
  const denied = await B.evaluate(async () => { try { await __fvDBX().set('news/hack1', {title:'x', text:'', kind:'info', by:__fvF.fuid, at:{__now:1}}); return false; } catch(e){ return true; } });
  ok(denied, '管理者でない人は、おしらせを送れない（データベースがことわる）');
  const denied2 = await B.evaluate(async () => { try { await __fvDBX().set('admins/' + __fvF.fuid, {key:'0'.repeat(64), at:{__now:1}}); return false; } catch(e){ return true; } });
  ok(denied2, 'でたらめな暗号では、管理者になれない');
  // 消す・ロック
  await A.click('#admList [data-del]');
  ok(await A.evaluate(() => document.getElementById('admList').textContent.includes('本当に消す')), '消す前にもう一回たしかめる');
  await A.click('#admList [data-del]');
  await waitFor(A, () => !document.getElementById('admList').textContent.includes('テストのおしらせ'), 10000, '消す');
  ok(true, '送ったおしらせを消せる');
  await A.click('#admLockBtn');
  ok(await shown(A, 'admLock'), 'ロックすると、またパスワードの画面になる');
  await A.keyboard.press('Escape');

  // 設定から、アップデートを確認できる
  await A.click('#btnSet'); await waitShown(A, 'mSet');
  ok((await A.textContent('#verName')).includes('ブラウザ版'), '設定に、いまのバージョンが出る（' + await A.textContent('#verName') + '）');
  await A.click('#updCheck');
  await waitFor(A, () => /いちばん新しい|新しいバージョン|画面を新しく/.test(document.getElementById('toast').textContent), 10000, 'アップデートを確認');
  ok(true, '「アップデートを確認する」で、新しいバージョンがあるかわかる（' + await A.textContent('#toast') + '）');
  await A.keyboard.press('Escape');

  // フレンドをやめる
  await A.click('#homeBtn'); await A.click('[data-ftab="all"]'); await A.click('#fbody [data-unf]'); await A.click('#cfOk');
  await waitFor(B, () => __fvF.friends.size === 0, 15000, 'フレンドをやめる');
  ok(true, 'フレンドをやめると、両方のリストから消える');
} catch(e){ ok(false, String(e.message || e)); }
ok(errs.length === 0, 'ページのエラーなし ' + errs.slice(0, 3).join(' / '));
await b.close();
done();
