package nl.dennis.sudoku;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The Sudoku game as an Android app: a full-screen WebView of the live game, so every update of the
 * website reaches the app without a new APK. Progress lives in this app's own storage; it comes over
 * from another device with the transfer link (sudokuopa://overzetten/<code> or ...#overzetten=<code>).
 */
public class MainActivity extends Activity {
    static final String HOME = "https://dennis10276.github.io/sudoku-app-opa/";
    static final String PREFIX = "/sudoku-app-opa";
    static final int CAMERA_REQ = 7;
    private WebView web;
    private PermissionRequest pendingCamera;   // the page asked for the camera; waiting for Android's permission

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " SudokuApp/1");
        web.addJavascriptInterface(new Bridge(this), "SudokuApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (isGame(u)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* no app for it */ }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                view.loadDataWithBaseURL(HOME, OFFLINE, "text/html", "utf-8", null);
            }
        });

        // "Code scannen" in the game uses the camera to read the transfer QR code
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() {
                    @Override public void run() { handleCamera(req); }
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest req) {
                if (req == pendingCamera) pendingCamera = null;
            }
        });

        if (state != null) web.restoreState(state);
        if (state == null || web.getUrl() == null) web.loadUrl(urlFor(getIntent()));
    }

    void handleCamera(PermissionRequest req) {
        boolean video = false;
        for (String r : req.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) video = true;
        Uri o = req.getOrigin();
        if (!video || o == null || !"https".equals(o.getScheme()) || !"dennis10276.github.io".equals(o.getHost())) { req.deny(); return; }
        String[] grant = { PermissionRequest.RESOURCE_VIDEO_CAPTURE };
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { req.grant(grant); return; }
        if (pendingCamera != null) pendingCamera.deny();
        pendingCamera = req;
        requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_REQ);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != CAMERA_REQ || pendingCamera == null) return;
        PermissionRequest req = pendingCamera; pendingCamera = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
            req.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        else req.deny();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getData() != null) web.loadUrl(urlFor(intent));
    }

    static boolean isGame(Uri u) {
        return u != null && "https".equals(u.getScheme()) && "dennis10276.github.io".equals(u.getHost())
                && u.getPath() != null && u.getPath().startsWith(PREFIX);
    }

    /** Which page to open: the game, or the game with a transfer code. */
    static String urlFor(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        if (u == null) return HOME;
        if ("sudokuopa".equals(u.getScheme())) {
            String code = u.getLastPathSegment();
            if (code != null && code.matches("[A-Za-z0-9_-]{8,8000}")) return HOME + "#overzetten=" + code;
            return HOME;
        }
        return isGame(u) ? u.toString() : HOME;
    }

    @Override
    public void onBackPressed() {
        // let the game close a sheet or go back to the start screen first
        web.evaluateJavascript("window.__appBack ? window.__appBack() : false", new ValueCallback<String>() {
            @Override public void onReceiveValue(String r) {
                if ("true".equals(r)) return;
                if (web.canGoBack()) web.goBack(); else finish();
            }
        });
    }

    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    /** The game tells the app its colours, so the status and navigation bars match light and dark mode. */
    static final class Bridge {
        private final Activity act;
        Bridge(Activity act) { this.act = act; }

        @JavascriptInterface
        public void setBars(final String color) {
            act.runOnUiThread(new Runnable() {
                @Override public void run() { applyBars(act, color); }
            });
        }
    }

    static void applyBars(Activity act, String color) {
        int c;
        try { c = Color.parseColor(color); } catch (Exception e) { return; }
        Window w = act.getWindow();
        w.setStatusBarColor(c);
        w.setNavigationBarColor(c);
        boolean light = (Color.red(c) * 299 + Color.green(c) * 587 + Color.blue(c) * 114) / 1000 > 140;
        View d = w.getDecorView();
        int f = d.getSystemUiVisibility();
        f = light ? (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        if (Build.VERSION.SDK_INT >= 26)
            f = light ? (f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        d.setSystemUiVisibility(f);
    }

    static final String OFFLINE = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<body style='font:20px system-ui,sans-serif;text-align:center;padding:30vh 24px;color:#1b2a44'>"
            + "<p style='font-size:26px;font-weight:700'>Geen internet</p>"
            + "<p>Sudoku heeft één keer internet nodig om te starten. Daarna werkt het ook zonder.</p>"
            + "<p><button onclick=\"location.href='" + HOME + "'\" style='font:inherit;font-weight:700;padding:14px 28px;"
            + "border:0;border-radius:14px;background:#2f6fe4;color:#fff'>Opnieuw proberen</button></p></body>";
}
