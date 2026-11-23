package app.futarivoice.twa;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * アプリの中でアップデートする：新しい APK をダウンロードして、今のアプリと入れかえる。
 * 進み具合は Web の画面の window.__fvUpd(じょうたい, 値) に知らせる。
 */
final class Updater {
    private static volatile boolean busy = false;

    private Updater() {}

    static void cb(String state, String value) {
        MainActivity.js("window.__fvUpd&&window.__fvUpd(" + JSONObject.quote(state) + "," + JSONObject.quote(value == null ? "" : value) + ")");
    }

    static void start(final Context c, final String url) {
        if (c == null || busy) return;
        if (url == null || !url.matches("https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/releases/download/v[0-9.]+/FutariVoice\\.apk")) {
            cb("error", "アップデートの場所がへんだよ");
            return;
        }
        // はじめの1回だけ、「このアプリからインストールしてもいい」の許可がいる
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            cb("needperm", "");
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()));
                Activity a = MainActivity.current;
                if (a != null) a.startActivity(i);
                else { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); }
            } catch (Exception e) {
                Log.w("FV", "unknown sources", e);
            }
            return;
        }
        busy = true;
        new Thread(() -> {
            try {
                File f = new File(c.getCacheDir(), "update.apk");
                download(url, f);
                PackageInfo pi = c.getPackageManager().getPackageArchiveInfo(f.getPath(), 0);
                if (pi == null || !c.getPackageName().equals(pi.packageName)) throw new Exception("ダウンロードしたファイルがへんだよ");
                @SuppressWarnings("deprecation")
                long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
                if (code <= BuildConfig.VERSION_CODE) throw new Exception("もう新しいバージョンだよ");
                cb("installing", "");
                install(c, f);
            } catch (Exception e) {
                Log.w("FV", "update", e);
                cb("error", String.valueOf(e.getMessage()));
            } finally {
                busy = false;
            }
        }, "fv-update").start();
    }

    private static void download(String url, File f) throws Exception {
        URL u = new URL(url);
        HttpURLConnection con;
        int hops = 0;
        while (true) {
            con = (HttpURLConnection) u.openConnection();
            con.setInstanceFollowRedirects(false);
            con.setConnectTimeout(20000);
            con.setReadTimeout(30000);
            int code = con.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = con.getHeaderField("Location");
                con.disconnect();
                if (loc == null || ++hops > 6) throw new Exception("ダウンロードの場所が見つからない");
                u = new URL(u, loc);
                if (!"https".equals(u.getProtocol())) throw new Exception("あんぜんでない場所だよ");
                continue;
            }
            if (code != 200) { con.disconnect(); throw new Exception("ダウンロードできなかった（" + code + "）"); }
            break;
        }
        long total = con.getContentLengthLong();
        long got = 0;
        int last = -1;
        try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(f)) {
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) {
                out.write(b, 0, n);
                got += n;
                int pct = total > 0 ? (int) (got * 100 / total) : 0;
                if (pct / 5 != last / 5) { last = pct; cb("progress", String.valueOf(pct)); }
            }
        } finally {
            con.disconnect();
        }
        if (total > 0 && got != total) throw new Exception("ダウンロードがとちゅうで止まった");
    }

    private static void install(Context c, File f) throws Exception {
        PackageInstaller pi = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        p.setAppPackageName(c.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) {
            // 2回目からは、確認なしで入れかえられることがある（Android 12 から）
            p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = pi.createSession(p);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (OutputStream out = s.openWrite("base.apk", 0, f.length()); InputStream in = new FileInputStream(f)) {
                byte[] b = new byte[65536];
                int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
                s.fsync(out);
            }
            Intent i = new Intent(c, InstallReceiver.class).setAction("app.futarivoice.INSTALL_RESULT");
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pend = PendingIntent.getBroadcast(c, id, i, fl);
            s.commit(pend.getIntentSender());
        }
    }
}
