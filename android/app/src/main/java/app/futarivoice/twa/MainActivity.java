package app.futarivoice.twa;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.MutableContextWrapper;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * ふたりボイス Android版。
 * アプリの中に Web の画面（公開しているサイトの /app/）を出す。
 * 画面（WebView）はアプリ全体で1つだけ持っていて、アプリの窓をとじても（スワイプで消しても）、
 * CallService が動いているあいだは画面の中身が動きつづける。だから通話が切れず、通知も届く。
 */
public class MainActivity extends Activity {
    static final String ACTION_HANGUP = "app.futarivoice.HANGUP";
    static final String ACTION_ANSWER = "app.futarivoice.ANSWER";
    static final String ACTION_DECLINE = "app.futarivoice.DECLINE";
    static final String EXTRA_OPEN = "open";
    private static final int REQ_MIC = 11, REQ_FILE = 12, REQ_NOTIF = 13;

    // ---- アプリ全体で1つだけの画面 ----
    static WebView web;
    static MutableContextWrapper webCtx;
    static boolean loaded = false;
    static final ArrayList<String> pendingJs = new ArrayList<>();
    static MainActivity current;
    private static final Handler main = new Handler(Looper.getMainLooper());

    private static PermissionRequest pendingPerm;
    private static ValueCallback<Uri[]> fileCb;
    private static boolean askedNotif = false, askedBattery = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = this;
        Notifs.channels(this);
        boolean first = web == null;
        if (first) {
            webCtx = new MutableContextWrapper(this);
            web = new WebView(webCtx);
            setupWeb(web);
        } else {
            webCtx.setBaseContext(this);
            ViewGroup p = (ViewGroup) web.getParent();
            if (p != null) p.removeView(web);
        }
        setContentView(web);
        handleIntent(getIntent(), first);
    }

    private static void setupWeb(WebView w) {
        w.setBackgroundColor(0xFF313338);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " FutariVoiceAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        if (Build.VERSION.SDK_INT >= 26) {
            // うしろに回っても、画面の中身（JavaScript・通話）を大事にあつかってもらう
            w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        w.addJavascriptInterface(new Bridge(), "FVAndroid");
        w.setWebViewClient(new Client());
        w.setWebChromeClient(new Chrome());
    }

    static Context ctx() { return webCtx != null ? webCtx.getApplicationContext() : null; }

    /** Web の画面で JavaScript を動かす（どのスレッドからでも呼べる） */
    static void js(final String code) {
        main.post(() -> {
            if (web == null) return;
            if (!loaded) { pendingJs.add(code); return; }
            web.evaluateJavascript(code, null);
        });
    }

    // ---------- Web の画面とアプリの橋 ----------
    static class Bridge {
        @JavascriptInterface
        public String platform() { return "android"; }

        /** Googleログインは、いつものブラウザでしてもらって、futarivoice://auth でもどってくる */
        @JavascriptInterface
        public void googleLogin(String state) {
            if (state == null || !state.matches("[a-z0-9]{16,64}")) return;
            final Uri u = Uri.parse(BuildConfig.APP_URL + "desktop-login.html?p=android&state=" + state);
            main.post(() -> openExternal(u));
        }

        /** ボイスや個人通話につながっているか */
        @JavascriptInterface
        public void callState(final boolean on, final String title, final String text) {
            main.post(() -> {
                if (on) askNotifPermission();
                CallService.setCall(ctx(), on, title, text);
            });
        }

        /** アプリをとじても、メッセージや電話を待つか */
        @JavascriptInterface
        public void standby(final boolean on) {
            main.post(() -> {
                if (on) { askNotifPermission(); askBattery(); }
                CallService.setStandby(ctx(), on);
            });
        }

        @JavascriptInterface
        public void notifyMsg(final String title, final String text, final String tag) {
            main.post(() -> Notifs.show(ctx(), title, text, tag, null));
        }

        @JavascriptInterface
        public void note(final String title, final String text, final String tag, final String target) {
            main.post(() -> Notifs.show(ctx(), title, text, tag, target));
        }

        @JavascriptInterface
        public void cancel(final String tag) {
            main.post(() -> Notifs.cancel(ctx(), tag));
        }
    }

    // ---------- どのリンクをアプリの中で開くか ----------
    static boolean isOurs(Uri u) {
        if (u == null) return false;
        String path = u.getPath() == null ? "" : u.getPath();
        return "https".equals(u.getScheme())
                && BuildConfig.SITE_HOST.equalsIgnoreCase(u.getHost())
                && path.startsWith(BuildConfig.BASE + "/app")
                && !path.contains("desktop-login");
    }

    static void openExternal(Uri u) {
        Context c = current != null ? current : ctx();
        if (c == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (ActivityNotFoundException e) {
            Log.w("FV", "no app for " + u);
        }
    }

    private void handleIntent(Intent i, boolean first) {
        Uri d = i == null ? null : i.getData();
        String action = i == null ? null : i.getAction();
        String open = i == null ? null : i.getStringExtra(EXTRA_OPEN);
        if (first) web.loadUrl(d != null && isOurs(d) ? d.toString() : BuildConfig.APP_URL);
        if (ACTION_HANGUP.equals(action)) { js("window.__fvHangup&&window.__fvHangup()"); return; }
        if (ACTION_ANSWER.equals(action)) { Notifs.cancel(this, "call"); js("window.__fvAnswer&&window.__fvAnswer()"); return; }
        if (ACTION_DECLINE.equals(action)) { Notifs.cancel(this, "call"); js("window.__fvDecline&&window.__fvDecline()"); return; }
        if (open != null) { js("window.__fvOpenTarget&&window.__fvOpenTarget(" + JSONObject.quote(open) + ")"); return; }
        if (d != null && "futarivoice".equals(d.getScheme())) {
            if ("auth".equals(d.getHost())) {
                String st = d.getQueryParameter("state"), tok = d.getQueryParameter("id_token");
                if (st != null && tok != null) {
                    js("window.__fvLoginResult&&window.__fvLoginResult(" + JSONObject.quote(st) + "," + JSONObject.quote(tok) + ")");
                }
            } else if ("invite".equals(d.getHost()) && d.getLastPathSegment() != null) {
                js("window.__fvOpenLink&&window.__fvOpenLink(" + JSONObject.quote("#invite-" + d.getLastPathSegment()) + ")");
            }
            return;
        }
        if (d != null && isOurs(d) && !first) js("window.__fvOpenLink&&window.__fvOpenLink(" + JSONObject.quote(d.toString()) + ")");
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handleIntent(i, false);
    }

    /** もどるボタン：開いている窓をとじる。とじるものがなければ、アプリをとじずにうしろへ回す */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null || !loaded) { moveTaskToBack(true); return; }
        web.evaluateJavascript("(window.__fvBack&&window.__fvBack())?'1':'0'", v -> {
            if (!"\"1\"".equals(v)) moveTaskToBack(true);
        });
    }

    private static void askNotifPermission() {
        Activity a = current;
        if (a == null || askedNotif || Build.VERSION.SDK_INT < 33) return;
        if (a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askedNotif = true;
            a.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
    }

    /** 電池の節約で止められないように、1回だけたのむ */
    private static void askBattery() {
        Activity a = current;
        if (a == null || askedBattery) return;
        askedBattery = true;
        android.content.SharedPreferences sp = a.getSharedPreferences("fv", MODE_PRIVATE);
        if (sp.getBoolean("askedBattery", false)) return;
        sp.edit().putBoolean("askedBattery", true).apply();
        try {
            PowerManager pm = (PowerManager) a.getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(a.getPackageName())) {
                @SuppressWarnings("BatteryLife")
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + a.getPackageName()));
                a.startActivity(i);
            }
        } catch (Exception e) {
            Log.w("FV", "battery", e);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_MIC && pendingPerm != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingPerm.deny();
            }
            pendingPerm = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCb = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        if (web != null) {
            ViewGroup p = (ViewGroup) web.getParent();
            if (p != null) p.removeView(web);
            webCtx.setBaseContext(getApplicationContext());
            // 通話中や「待つ」がオンのときは、画面の中身をこわさずに動かしつづける
            if (isFinishing() && !CallService.keepAlive()) {
                web.destroy();
                web = null;
                loaded = false;
                pendingJs.clear();
                stopService(new Intent(this, CallService.class));
            }
        }
        super.onDestroy();
    }

    static class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (isOurs(u) || !r.isForMainFrame()) return false;
            openExternal(u);
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
            loaded = false;
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            loaded = true;
            for (String c : pendingJs) v.evaluateJavascript(c, null);
            pendingJs.clear();
        }

        @Override
        public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
            // 画面の中身が落ちたときは、アプリごと落ちないように作りなおす
            Log.w("FV", "renderer gone");
            ViewGroup p = (ViewGroup) v.getParent();
            if (p != null) p.removeView(v);
            v.destroy();
            if (v == web) { web = null; loaded = false; pendingJs.clear(); }
            Context c = ctx();
            if (c != null) CallService.stopAll(c);
            if (current != null) current.recreate();
            return true;
        }
    }

    static class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest r) {
            boolean audio = false;
            for (String res : r.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) audio = true;
            Uri o = r.getOrigin();
            Activity a = current;
            if (!audio || o == null || !BuildConfig.SITE_HOST.equalsIgnoreCase(o.getHost())) { r.deny(); return; }
            Context c = a != null ? a : ctx();
            if (c != null && c.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else if (a != null) {
                if (pendingPerm != null) pendingPerm.deny();
                pendingPerm = r;
                a.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            } else {
                r.deny();
            }
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            Activity a = current;
            if (a == null) { cb.onReceiveValue(null); return true; }
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            try {
                a.startActivityForResult(params.createIntent(), REQ_FILE);
            } catch (Exception e) {
                fileCb = null;
                cb.onReceiveValue(null);
            }
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            Log.i("FV", m.message());
            return true;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean dialog, boolean user, Message msg) {
            // target="_blank" のリンクは、いつものブラウザで開く
            WebView tmp = new WebView(view.getContext());
            tmp.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                    openExternal(r.getUrl());
                    v.destroy();
                    return true;
                }
            });
            ((WebView.WebViewTransport) msg.obj).setWebView(tmp);
            msg.sendToTarget();
            return true;
        }
    }
}
