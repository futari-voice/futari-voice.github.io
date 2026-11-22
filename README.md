# ふたりボイス

友だち4人までの、自分たちだけのサーバー。チャット・通話・画面共有ができる Discord 風アプリ。

- **ダウンロードサイト**: `https://<GitHubのユーザー名>.github.io/`（リポジトリ名が `<ユーザー名>.github.io` のとき）
- **Webアプリ**: 上のアドレスの `app/`（ログイン必須）
- **Windows版**: Electron のインストーラー（`FutariVoice-Setup.exe`）。中身は公開中の Web アプリなので、いつも最新
- **Android版**: Trusted Web Activity の APK（`FutariVoice.apk`）。Chrome のしくみで動く

## しくみ

| 部分 | 使っているもの |
|---|---|
| ログイン | Firebase Authentication（Google／ユーザー名＋パスワード）。ユーザー名は `ユーザー名@id.goodrobotapp.com` という、とどかないメールアドレスとして登録 |
| 声・画面・チャット | WebRTC（PeerJS）。友だちの機械と直接つながる。つながらないときは PeerJS の中継サーバー（TURN）|
| サイトの公開 | GitHub Pages |
| .exe と .apk を作る | GitHub Actions（`.github/workflows/release.yml`）|

## はじめのじゅんび（1回だけ）

### 1. Firebase
1. https://console.firebase.google.com で「プロジェクトを作成」（Google アナリティクスはオフでOK）
2. 「Authentication」→「始める」→「ログイン方法」で **Google** と **メール/パスワード** を有効にする
3. 歯車 →「プロジェクトの設定」→「マイアプリ」→ ウェブ（`</>`）を追加 → 出てきた `firebaseConfig` を `firebase-config.json` として保存（下の形）
4. 「Authentication」→「設定」→「承認済みドメイン」に `<GitHubのユーザー名>.github.io` を追加

```json
{ "apiKey": "...", "authDomain": "xxxx.firebaseapp.com", "projectId": "xxxx", "storageBucket": "...", "messagingSenderId": "...", "appId": "..." }
```

### 2. GitHub
1. 公開（Public）のリポジトリを作る（名前を `<ユーザー名>.github.io` にすると、サイトがいちばん短いアドレスになる）
2. 「Settings」→「Pages」→「Source」を **GitHub Actions** にする
3. 「Settings」→「Secrets and variables」→「Actions」→「New repository secret」で2つ入れる

| 名前 | 中身 |
|---|---|
| `ANDROID_KEYSTORE_B64` | Android の署名カギ（base64）|
| `ANDROID_KEYSTORE_PASSWORD` | Android の署名カギのパスワード |

4. `main` にプッシュすると、自動で「テスト → .exe と .apk を作る → リリース → サイト公開 → 本物のネットでテスト」が動く

> Android の署名カギは、なくすと次のバージョンを上書きインストールできなくなるよ。ぜったい人に見せないで、大事にしまっておいてね。

## 自分のパソコンでためす

```bash
npm ci
node scripts/build.mjs                 # site/ にサイトができる
npx peerjs --port 9000 --host 127.0.0.1 &
(cd site && python3 -m http.server 8080 --bind 127.0.0.1 &)
npx firebase emulators:exec --only auth --project demo-futari "node tests/local.mjs"
```

`http://127.0.0.1:8080/app/?server=127.0.0.1:9000&emu=127.0.0.1:9099` で、練習用のサーバーにつながったアプリが開く。
