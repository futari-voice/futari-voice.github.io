// サイト（ダウンロードページ＋Webアプリ）を site/ に組み立てる
// 使い方: node scripts/build.mjs   （Firebaseの設定は firebase-config.json か 環境変数 FIREBASE_CONFIG）
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); console.log('wrote', p, s.length, 'bytes'); };

let config = null;
if (process.env.FIREBASE_CONFIG) config = JSON.parse(process.env.FIREBASE_CONFIG);
else if (fs.existsSync(path.join(root, 'firebase-config.json'))) config = JSON.parse(read('firebase-config.json'));
if (config && !config.apiKey) config = null;
if (!config) console.warn('!! Firebase の設定がないので、ログイン画面は「じゅんび中」になります');
const repo = process.env.GITHUB_REPOSITORY || (config && config.githubRepo) || '';
const run = +(process.env.GITHUB_RUN_NUMBER || 0);      // GitHub で組み立てるときの番号（= バージョン 1.0.番号）

const fb = (await build({ entryPoints: [path.join(root, 'src/fb.js')], bundle: true, format: 'iife', minify: true, target: 'es2020', write: false, logLevel: 'warning' })).outputFiles[0].text;
const peer = read('node_modules/peerjs/dist/peerjs.min.js').replace('//# sourceMappingURL=peerjs.min.js.map', '');
for (const [n, t] of [['firebase', fb], ['peerjs', peer]]) if (/<\/script/i.test(t)) throw new Error(n + ' contains </script');
const cfgJson = JSON.stringify(config).replace(/</g, '\\u003c');
const fill = html => html
  .replace('/*@@PEERJS@@*/', () => '/* PeerJS 1.5.5 (MIT) https://peerjs.com */\n' + peer)
  .replace('/*@@FIREBASE@@*/', () => '/* Firebase JS SDK (Apache-2.0) https://firebase.google.com */\n' + fb)
  .replace('/*@@FBCONFIG@@*/null', () => cfgJson)
  .replace(/@@REPO@@/g, () => repo)
  .replace(/@@BUILD@@/g, () => String(run));

fs.rmSync(path.join(root, 'site'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'static'), path.join(root, 'site'), { recursive: true });
write('site/app/index.html', fill(read('src/app.html')));
write('site/app/desktop-login.html', fill(read('src/desktop-login.html')));
write('site/index.html', fill(read('src/site.html')));
// アプリが「新しいバージョンがあるか」を調べるためのファイル
const rel = n => repo ? `https://github.com/${repo}/releases/download/v1.0.${run}/${n}` : '';
write('site/version.json', JSON.stringify({ build: run, name: '1.0.' + run,
  android: { code: run, url: rel('FutariVoice.apk') },
  windows: { version: '1.0.' + run, url: rel('FutariVoice-Setup.exe') } }, null, 1));
