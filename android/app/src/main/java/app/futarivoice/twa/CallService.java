package app.futarivoice.twa;

import android.Manifest;
import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

/**
 * ふたりボイスを「うしろで動かしておく」ための、小さなおしらせ。
 *   通話中 … 「ボイスにつながっているよ」（通話が切れないように）
 *   待つ   … 「メッセージや電話を待っているよ」（アプリをとじても通知が届くように）
 */
public class CallService extends Service {
    static final String ACTION_HANGUP = "app.futarivoice.svc.HANGUP";
    static final String ACTION_DECLINE = "app.futarivoice.svc.DECLINE";

    static boolean inCall = false, standby = false;
    static String callTitle = "", callText = "";
    static boolean running = false;

    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;

    static boolean keepAlive() { return inCall || standby; }

    static void setCall(Context c, boolean on, String title, String text) {
        inCall = on;
        callTitle = title == null ? "" : title;
        callText = text == null ? "" : text;
        update(c);
    }

    static void setStandby(Context c, boolean on) {
        standby = on;
        update(c);
    }

    static void stopAll(Context c) {
        inCall = false;
        standby = false;
        update(c);
    }

    private static void update(Context c) {
        if (c == null) return;
        Intent i = new Intent(c, CallService.class);
        if (keepAlive()) {
            try {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            } catch (Exception e) {
                Log.w("FV", "start service", e);
            }
        } else {
            c.stopService(i);
        }
    }

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_HANGUP.equals(action)) { MainActivity.js("window.__fvHangup&&window.__fvHangup()"); }
        if (ACTION_DECLINE.equals(action)) { Notifs.cancel(this, "call"); MainActivity.js("window.__fvDecline&&window.__fvDecline()"); }
        if (!keepAlive()) {
            // たのまれたことだけして、すぐ止まる（おしらせのボタンから呼ばれたとき）
            try { goForeground(); } catch (Exception ignored) {}
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            goForeground();
        } catch (Exception e) {
            Log.w("FV", "startForeground", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        locks(inCall);
        running = true;
        return START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    private void goForeground() {
        Notifs.channels(this);
        Notification.Builder b;
        if (inCall) {
            b = Notifs.builder(this, Notifs.CH_CALL)
                    .setContentTitle(callTitle.isEmpty() ? "ふたりボイス" : callTitle)
                    .setContentText(callText)
                    .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_stat), "切る",
                            Notifs.service(this, ACTION_HANGUP, 4)).build());
        } else {
            b = Notifs.builder(this, Notifs.CH_WAIT)
                    .setContentTitle("ふたりボイス")
                    .setContentText("メッセージや電話を待っているよ");
        }
        Notification n = b.setOngoing(true).setShowWhen(false).setContentIntent(Notifs.open(this, null, null, 3)).build();
        if (Build.VERSION.SDK_INT >= 29) {
            int type;
            if (inCall) {
                type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
                if (Build.VERSION.SDK_INT >= 30
                        && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                }
            } else {
                type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
            }
            startForeground(1, n, type);
        } else {
            startForeground(1, n);
        }
    }

    @SuppressWarnings("deprecation")
    private void locks(boolean call) {
        try {
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "futarivoice:keep");
                wake.setReferenceCounted(false);
            }
            if (call) { if (!wake.isHeld()) wake.acquire(6L * 60 * 60 * 1000); }
            else if (wake.isHeld()) wake.release();
            if (call && wifi == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (wm != null) {
                    wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "futarivoice:call");
                    wifi.setReferenceCounted(false);
                }
            }
            if (wifi != null) { if (call && !wifi.isHeld()) wifi.acquire(); else if (!call && wifi.isHeld()) wifi.release(); }
        } catch (Exception e) {
            Log.w("FV", "locks", e);
        }
    }

    @Override
    public void onTaskRemoved(Intent root) {
        // アプリの窓をスワイプで消しても、待つ・通話中ならそのまま動きつづける
        if (!keepAlive()) stopSelf();
        super.onTaskRemoved(root);
    }

    @Override
    public void onDestroy() {
        running = false;
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) {}
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) {}
        wake = null;
        wifi = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
}
