// テスト用のおたすけ道具
import { chromium } from 'playwright';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
export const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
export const done = () => { console.log(failed ? `\n${failed} こ失敗` : '\nぜんぶ成功'); process.exit(failed ? 1 : 0); };
export async function launch(){
  return chromium.launch({ headless: true, executablePath: process.env.PW_EXEC || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
}
export async function page(browser, url, name, errs, setup){
  const ctx = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1280, height: 800 } });
  if (setup) await setup(ctx);
  const p = await ctx.newPage(); p._n = name;
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d'); let t = 0; setInterval(() => { t++; g.fillStyle = '#246'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('GAME ' + t, 40, 180); }, 33); return c.captureStream(30); }; });
  await p.goto(url);
  return p;
}
export const shown = (p, id) => p.evaluate(i => !document.getElementById(i).classList.contains('hide'), id);
export async function waitShown(p, id, ms = 15000){ const t0 = Date.now(); while (Date.now() - t0 < ms){ if (await shown(p, id).catch(() => false)) return true; await sleep(150); } throw new Error(p._n + ': #' + id + ' が出なかった（' + (await p.textContent('#lErr').catch(() => '')) + '）'); }
export async function waitFor(p, fn, ms, label){ const t0 = Date.now(); while (Date.now() - t0 < ms){ try { if (await p.evaluate(fn)) return Date.now() - t0; } catch(e){} await sleep(200); } throw new Error('時間切れ: ' + label + ' (' + p._n + ')'); }
export async function register(p, user, pass, name){
  await waitShown(p, 'login');
  await p.click('#tabUp'); await p.fill('#lUser', user); await p.fill('#lPass', pass); await p.fill('#lPass2', pass); await p.click('#lGo');
  await waitShown(p, 'welcome'); if (name) await p.fill('#wName', name); await p.click('#wf button[type=submit]');
  await waitShown(p, 'app');
}
export const okPeers = () => [...__fv.peers.values()].filter(P => P.ok && P.conn && P.conn.open).length;
export const voiceLinks = () => [...__fv.peers.values()].filter(P => P.call && P.audio && P.audio.srcObject).length;
export async function audioBytes(p){ return p.evaluate(async () => { const out = []; for (const P of __fv.peers.values()){ if (!P.call) continue; const r = await P.call.peerConnection.getStats(); let b = 0, relay = false; const pairs = {}; r.forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'audio') b = s.bytesReceived; if (s.type === 'local-candidate') pairs[s.id] = s.candidateType; }); r.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && pairs[s.localCandidateId] === 'relay') relay = true; }); out.push({ b, relay }); } return out; }); }
export async function dcBytes(p){ return p.evaluate(async () => { const pc = __fvDC.pc; if (!pc) return 0; const r = await pc.getStats(); let b = 0; r.forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'audio') b = s.bytesReceived; }); return b; }); }
