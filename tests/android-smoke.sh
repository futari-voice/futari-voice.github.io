#!/usr/bin/env bash
# Android版（APK）をエミュレーターに入れて、アプリが動くか・うしろに回っても止まらないかをためす
set -u
SITE="${1%/}"
PKG=app.futarivoice.twa
APK=dist/FutariVoice.apk
fail=0
ok(){ echo "PASS $1"; }
ng(){ echo "FAIL $1"; fail=$((fail+1)); }
warn(){ echo "WARN $1"; }
log(){ adb logcat -d -s FV:I 2>/dev/null; }
waitlog(){ local i; for i in $(seq 1 "$2"); do if log | grep -q "$1"; then return 0; fi; sleep 1; done; return 1; }
alive(){ sleep 3; adb logcat -c; sleep 12; log | grep -q '\[FV\] alive'; }
fg(){ adb shell dumpsys activity services $PKG | grep -q "isForeground=true"; }
hasActivity(){ adb shell dumpsys activity activities | grep -q "$PKG/.MainActivity"; }

adb wait-for-device
if adb install -r "$APK"; then ok "APKをインストールできる"; else ng "APKをインストールできる"; exit 1; fi
adb shell pm grant $PKG android.permission.RECORD_AUDIO || true
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell dumpsys deviceidle whitelist +$PKG >/dev/null 2>&1 || true
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity -a android.intent.action.VIEW -d "$SITE/app/?debug=1\&fgtest=1"
if waitlog '\[FV\] bridge android' 150; then ok "アプリの中でページが開いて、アプリとつながる"; else ng "アプリの中でページが開く"; fi
if waitlog '\[FV\] screen login' 60; then ok "ログイン画面が出る"; else ng "ログイン画面が出る"; fi
adb exec-out screencap -p > android-login.png || true
waitlog '\[FV\] fgtest on' 30; sleep 4
if fg; then ok "通話中のおしらせ（うしろでも止まらないしくみ）が動く"; else ng "通話中のおしらせが動く"; adb shell dumpsys activity services $PKG | head -30; fi
adb shell input keyevent KEYCODE_HOME
if alive; then ok "ほかのアプリに切りかえても、うしろで動きつづける"; else ng "ほかのアプリに切りかえても動きつづける"; fi
adb shell am start -n $PKG/.MainActivity; sleep 5
adb shell input keyevent KEYCODE_BACK; sleep 2
if alive; then ok "もどるボタンをおしても、とじずにうしろで動きつづける"; else ng "もどるボタンでとじない"; fi
if hasActivity; then ok "アプリの画面ものこっている"; else ng "アプリの画面ものこっている"; fi

# 「とじても待つ」：通話していなくても、アプリをスワイプで消しても、うしろで待ちつづける
adb shell am force-stop $PKG; sleep 2
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity -a android.intent.action.VIEW -d "$SITE/app/?debug=1\&standbytest=1"
waitlog '\[FV\] standby on' 150; sleep 4
if fg; then ok "通話していなくても「待つ」しくみが動く"; else ng "「待つ」しくみが動く"; adb shell dumpsys activity services $PKG | head -30; fi
if adb shell dumpsys notification --noredact 2>/dev/null | grep -q "standby\|待っている\|futarivoice"; then ok "待っているおしらせが出ている"; else warn "おしらせの文字を見つけられなかった"; fi
# 最近使ったアプリの画面を開いて、アプリを消す（「Clear all」をおす／だめなら上にスワイプ）
tapText(){ adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; local b; b=$(adb shell cat /sdcard/ui.xml 2>/dev/null | tr '>' '\n' | grep -i "text=\"$1\"" | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1 | grep -o '[0-9]*'); [ -z "$b" ] && return 1; set -- $b; adb shell input tap $((($1+$3)/2)) $((($2+$4)/2)); }
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
for try in 1 2 3; do
  hasActivity || break
  adb shell input keyevent KEYCODE_APP_SWITCH; sleep 4
  if ! tapText "Clear all"; then
    adb shell input swipe $((W/2)) $((H*55/100)) $((W/2)) $((H/20)) 600
  fi
  sleep 4
done
adb shell input keyevent KEYCODE_HOME; sleep 2
if hasActivity; then
  warn "エミュレーターで、アプリをスワイプで消せなかった（このチェックはとばすよ）"
else
  if alive; then ok "アプリをスワイプで消しても、うしろで待ちつづける（通知が届く）"; else ng "スワイプで消しても待ちつづける"; fi
  adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 6
  if hasActivity && alive; then ok "消したあとにアプリを開くと、前の画面のまま使える"; else ng "消したあとにアプリを開ける"; fi
fi
adb exec-out screencap -p > android-after.png || true
echo "--- アプリのログ（さいご）"; log | tail -10
if [ "$fail" -gt 0 ]; then echo "$fail こ失敗"; exit 1; fi
echo "ぜんぶ成功"
