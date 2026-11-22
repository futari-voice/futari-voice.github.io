#!/usr/bin/env bash
# Android版（APK）をエミュレーターに入れて、アプリが動くか・うしろに回っても止まらないかをためす
set -u
SITE="${1%/}"
PKG=app.futarivoice.twa
APK=dist/FutariVoice.apk
fail=0
ok(){ echo "PASS $1"; }
ng(){ echo "FAIL $1"; fail=$((fail+1)); }
log(){ adb logcat -d -s FV:I 2>/dev/null; }
waitlog(){ local i; for i in $(seq 1 "$2"); do if log | grep -q "$1"; then return 0; fi; sleep 1; done; return 1; }
alive(){ sleep 3; adb logcat -c; sleep 12; log | grep -q '\[FV\] alive'; }

adb wait-for-device
if adb install -r "$APK"; then ok "APKをインストールできる"; else ng "APKをインストールできる"; exit 1; fi
adb shell pm grant $PKG android.permission.RECORD_AUDIO || true
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity -a android.intent.action.VIEW -d "$SITE/app/?debug=1\&fgtest=1"
if waitlog '\[FV\] bridge android' 150; then ok "アプリの中でページが開いて、アプリとつながる"; else ng "アプリの中でページが開く"; fi
if waitlog '\[FV\] screen login' 60; then ok "ログイン画面が出る"; else ng "ログイン画面が出る"; fi
adb exec-out screencap -p > android-login.png || true
waitlog '\[FV\] fgtest on' 30; sleep 4
if adb shell dumpsys activity services $PKG | grep -q "isForeground=true"; then ok "通話中のおしらせ（うしろでも止まらないしくみ）が動く"; else ng "通話中のおしらせが動く"; adb shell dumpsys activity services $PKG | head -30; fi
adb shell input keyevent KEYCODE_HOME
if alive; then ok "ほかのアプリに切りかえても、うしろで動きつづける"; else ng "ほかのアプリに切りかえても動きつづける"; fi
adb shell am start -n $PKG/.MainActivity; sleep 5
adb shell input keyevent KEYCODE_BACK; sleep 2
if alive; then ok "もどるボタンをおしても、とじずにうしろで動きつづける"; else ng "もどるボタンでとじない"; fi
if adb shell dumpsys activity activities | grep -q "$PKG/.MainActivity"; then ok "アプリの画面ものこっている"; else ng "アプリの画面ものこっている"; fi
echo "--- アプリのログ（さいご）"; log | tail -15
if [ "$fail" -gt 0 ]; then echo "$fail こ失敗"; exit 1; fi
echo "ぜんぶ成功"
