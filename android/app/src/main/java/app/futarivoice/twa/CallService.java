package app.futarivoice.twa;

import android.Manifest;
import android.app.Notification;
import android.app.Service;
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
 * ボイスや個人通話につながっているあいだだけ動く「おしらせ」。
 * これがあると、ほかのアプリ（ゲーム）に切りかえても、スマホがふたりボイスを止めない。
 */
public class CallService extends Service {
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    @SuppressWarnings("deprecation")
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent == null ? null : intent.getStringExtra("title");
        String text = intent == null ? null : intent.getStringExtra("text");
        Notifs.channels(this);
        Notification n = Notifs.builder(this, Notifs.CH_CALL)
                .setContentTitle(title == null || title.isEmpty() ? "ふたりボイス" : title)
                .setContentText(text == null ? "" : text)
                .setOngoing(true)
                .setContentIntent(Notifs.open(this, null, 3))
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, R.drawable.ic_stat), "切る",
                        Notifs.open(this, MainActivity.ACTION_HANGUP, 4)).build())
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
                if (Build.VERSION.SDK_INT >= 30
                        && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                }
                startForeground(1, n, type);
            } else {
                startForeground(1, n);
            }
        } catch (Exception e) {
            Log.w("FV", "startForeground", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "futarivoice:call");
                wake.acquire(6L * 60 * 60 * 1000);
            }
            if (wifi == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (wm != null) {
                    wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "futarivoice:call");
                    wifi.acquire();
                }
            }
        } catch (Exception e) {
            Log.w("FV", "locks", e);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) {}
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) {}
        wake = null;
        wifi = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
}
