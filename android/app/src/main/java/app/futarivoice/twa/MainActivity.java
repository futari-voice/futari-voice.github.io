package app.futarivoice.twa;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
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
 * もどるボタンやほかのアプリに切りかえても「とじない」（うしろで動きつづける）ので、通話が切れない。
 * 通話中は CallService（おしらせ）で、スマホに「動いているよ」と知らせる。
 */
public class MainActivity extends Activity {
    static final String ACTION_HANGUP = "app.futarivoice.HANGUP";
    private static final int REQ_MIC = 11, REQ_FILE = 12, REQ_NOTIF = 13;

    private WebView web;
    private boolean loaded = false;
    private boolean askedNotif = false;
    private final ArrayList<String> pendingJs = new ArrayList<>();
    private PermissionRequest pendingPerm;
    private ValueCallback<Uri[]> fileCb;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Notifs.channels(this);
        web = new WebView(this);
        web.setBackgroundColor(0xFF313338);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " FutariVoiceAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        if (Build.VERSION.SDK_INT >= 26) {
            // うしろに回っても、画面の中身（JavaScript・通話）を大事にあつかってもらう
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        web.addJavascriptInterface(new Bridge(), "FVAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        handleIntent(getIntent(), true);
    }

    // ---------- Web の画面とアプリの橋 ----------
    class Bridge {
        @JavascriptInterface
        public String platform() { return "android"; }

        /** Googleログインは、いつものブラウザでしてもらって、futarivoice://auth でもどってくる */
        @JavascriptInterface
        public void googleLogin(String state) {
            if (state == null || !state.matches("[a-z0-9]{16,64}")) return;
            final Uri u = Uri.parse(BuildConfig.APP_URL + "desktop-login.html?p=android&state=" + state);
            runOnUiThread(() -> openExternal(u));
        }

        /** ボイスや個人通話につながっている間は、おしらせを出してうしろでも止まらないようにする */
        @JavascriptInterface
        public void callState(final boolean on, final String title, final String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(MainActivity.this, CallService.class);
                if (on) {
                    askNotifPermission();
                    i.putExtra("title", title);
                    i.putExtra("text", text);
                    try {
                        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
                    } catch (Exception e) {
                        Log.w("FV", "callState", e);
                    }
                } else {
                    stopService(i);
                }
            });
        }

        @JavascriptInterface
        public void notifyMsg(final String title, final String text, final String tag) {
            runOnUiThread(() -> Notifs.show(MainActivity.this, title, text, tag));
        }

        @JavascriptInterface
        public void cancel(final String tag) {
            runOnUiThread(() -> Notifs.cancel(MainActivity.this, tag));
        }
    }

    // ---------- どのリンクをアプリの中で開くか ----------
    private boolean isOurs(Uri u) {
        if (u == null) return false;
        String path = u.getPath() == null ? "" : u.getPath();
        return "https".equals(u.getScheme())
                && BuildConfig.SITE_HOST.equalsIgnoreCase(u.getHost())
                && path.startsWith(BuildConfig.BASE + "/app")
                && !path.contains("desktop-login");
    }

    void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Log.w("FV", "no app for " + u);
        }
    }

    void js(String code) {
        if (web == null) return;
        if (!loaded) { pendingJs.add(code); return; }
        web.evaluateJavascript(code, null);
    }

    private void handleIntent(Intent i, boolean first) {
        Uri d = i == null ? null : i.getData();
        String action = i == null ? null : i.getAction();
        if (ACTION_HANGUP.equals(action)) {
            js("window.__fvHangup&&window.__fvHangup()");
            if (first) web.loadUrl(BuildConfig.APP_URL);
            return;
        }
        if (d != null && "futarivoice".equals(d.getScheme())) {
            if ("auth".equals(d.getHost())) {
                String st = d.getQueryParameter("state"), tok = d.getQueryParameter("id_token");
                if (st != null && tok != null) {
                    js("window.__fvLoginResult&&window.__fvLoginResult(" + JSONObject.quote(st) + "," + JSONObject.quote(tok) + ")");
                }
            } else if ("invite".equals(d.getHost()) && d.getLastPathSegment() != null) {
                js("window.__fvOpenLink&&window.__fvOpenLink(" + JSONObject.quote("#invite-" + d.getLastPathSegment()) + ")");
            }
            if (first) web.loadUrl(BuildConfig.APP_URL);
            return;
        }
        if (d != null && isOurs(d)) {
            if (first) web.loadUrl(d.toString());
            else js("window.__fvOpenLink&&window.__fvOpenLink(" + JSONObject.quote(d.toString()) + ")");
            return;
        }
        if (first) web.loadUrl(BuildConfig.APP_URL);
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

    private void askNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !askedNotif
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askedNotif = true;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
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
        if (isFinishing()) stopService(new Intent(this, CallService.class));
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    class Client extends WebViewClient {
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
            stopService(new Intent(MainActivity.this, CallService.class));
            ViewGroup p = (ViewGroup) v.getParent();
            if (p != null) p.removeView(v);
            v.destroy();
            if (v == web) web = null;
            recreate();
            return true;
        }
    }

    class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest r) {
            boolean audio = false;
            for (String res : r.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) audio = true;
            Uri o = r.getOrigin();
            if (!audio || o == null || !BuildConfig.SITE_HOST.equalsIgnoreCase(o.getHost())) {
                r.deny();
                return;
            }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                if (pendingPerm != null) pendingPerm.deny();
                pendingPerm = r;
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
            } catch (Exception e) {
                fileCb = null;
                cb.onReceiveValue(null);
                return false;
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
            WebView tmp = new WebView(MainActivity.this);
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
