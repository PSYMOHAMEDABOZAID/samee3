package app.samee3.tv;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class TvActivity extends Activity {
    private static final String HOME_URL = "https://samee3.vercel.app/";
    private static final String LEGACY_URL = "https://samee3.vercel.app/legacy/index.html";
    private static final String TRUSTED_HOST = "samee3.vercel.app";
    private static final int WRITE_DOWNLOADS_REQUEST = 901;
    private WebView webView;
    private FrameLayout root;
    private LinearLayout errorView;
    private ProgressBar progressBar;
    private boolean mainPageError = false;
    private String pendingDownloadUrl;
    private String pendingDownloadMime;
    private String pendingDownloadDisposition;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(248, 241, 227));
        setContentView(root);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(248, 241, 227));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        createProgress();
        createErrorView();
        configureWebView();
        if (savedInstanceState == null) webView.loadUrl(HOME_URL);
        else webView.restoreState(savedInstanceState);
    }

    private void createProgress() {
        progressBar = new ProgressBar(this);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dp(55), dp(55), Gravity.CENTER);
        root.addView(progressBar, params);
    }

    private void createErrorView() {
        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(dp(34), dp(28), dp(34), dp(28));
        errorView.setBackgroundColor(Color.rgb(248, 241, 227));
        TextView description = new TextView(this);
        description.setText(R.string.connection_error);
        description.setTextSize(21);
        description.setTextColor(Color.rgb(25, 79, 67));
        description.setGravity(Gravity.CENTER);
        errorView.addView(description, new LinearLayout.LayoutParams(-1, -2));
        Button retry = new Button(this);
        retry.setText(R.string.try_again);
        retry.setOnClickListener(v -> {
            mainPageError = false;
            errorView.setVisibility(View.GONE);
            webView.loadUrl(HOME_URL);
        });
        LinearLayout.LayoutParams retryLayout = new LinearLayout.LayoutParams(dp(220), dp(65));
        retryLayout.topMargin = dp(25);
        errorView.addView(retry, retryLayout);
        Button lite = new Button(this);
        lite.setText("فتح النسخة الخفيفة للأجهزة القديمة");
        lite.setOnClickListener(v -> {
            mainPageError = false;
            errorView.setVisibility(View.GONE);
            webView.loadUrl(LEGACY_URL);
        });
        LinearLayout.LayoutParams liteLayout = new LinearLayout.LayoutParams(dp(320), dp(65));
        liteLayout.topMargin = dp(14);
        errorView.addView(lite, liteLayout);
        root.addView(errorView, new FrameLayout.LayoutParams(-1, -1));
        errorView.setVisibility(View.GONE);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                mainPageError = false;
                progressBar.setVisibility(View.VISIBLE);
                errorView.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (mainPageError) {
                    errorView.setVisibility(View.VISIBLE);
                } else if (isTrusted(Uri.parse(url))) {
                    if (!url.contains("/legacy/")) {
                        // Detect legacy JS engines that paint the UI but cannot run Next.js.
                        view.evaluateJavascript("(function(){return !!(window.Promise && window.fetch && window.Map && Object.assign && Array.prototype.includes)})()", supported -> {
                            if ("false".equals(supported) && webView != null && !mainPageError) webView.loadUrl(LEGACY_URL);
                        });
                    }
                    injectNavigation();
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mainPageError = true;
                    progressBar.setVisibility(View.GONE);
                    errorView.setVisibility(View.VISIBLE);
                }
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, android.webkit.WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    mainPageError = true;
                    progressBar.setVisibility(View.GONE);
                    errorView.setVisibility(View.VISIBLE);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }
            @Override @SuppressWarnings("deprecation") public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }
        });
        webView.setDownloadListener(new DownloadListener() {
            @Override public void onDownloadStart(String url, String userAgent,
                                                   String contentDisposition, String mimeType, long contentLength) {
                if (!isHttpsUrl(url)) {
                    Toast.makeText(TvActivity.this, R.string.download_problem, Toast.LENGTH_LONG).show();
                    return;
                }
                download(url, contentDisposition, mimeType);
            }
        });
    }

    private static boolean isTrusted(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && TRUSTED_HOST.equalsIgnoreCase(uri.getHost());
    }
    private static boolean isHttpsUrl(String value) {
        try { return "https".equalsIgnoreCase(Uri.parse(value).getScheme()); }
        catch (Exception ignored) { return false; }
    }
    private boolean handleNavigation(Uri uri) {
        if (isTrusted(uri)) return false;
        String scheme = uri == null ? "" : uri.getScheme();
        if (scheme == null) return true;
        // WebView uses these schemes for built-in pages and generated content.
        if (scheme.equals("about") || scheme.equals("blob") || scheme.equals("data")) return false;
        if (scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("mailto") || scheme.equalsIgnoreCase("tel")) {
            openExternal(uri);
        }
        return true; // refuse untrusted javascript:, file:, content: and intent: URLs
    }
    private void openExternal(Uri uri) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException ex) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show();
        }
    }
    private void injectNavigation() {
        try (InputStream input = getAssets().open("tv-navigation.js")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] bytes = new byte[8192];
            int size;
            while ((size = input.read(bytes)) != -1) output.write(bytes, 0, size);
            webView.evaluateJavascript(new String(output.toByteArray(), StandardCharsets.UTF_8), null);
        } catch (Exception ignored) { /* native D-pad remains available */ }
    }

    private void download(String url, String contentDisposition, String mimeType) {
        if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT <= 28
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingDownloadUrl = url;
            pendingDownloadDisposition = contentDisposition;
            pendingDownloadMime = mimeType;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, WRITE_DOWNLOADS_REQUEST);
            return;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
            request.setTitle(filename);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (mimeType != null && !mimeType.isEmpty()) request.setMimeType(mimeType);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isEmpty()) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", webView.getSettings().getUserAgentString());
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("No DownloadManager");
            manager.enqueue(request);
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {
            openExternal(Uri.parse(url));
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == WRITE_DOWNLOADS_REQUEST && pendingDownloadUrl != null) {
            String url = pendingDownloadUrl;
            String mime = pendingDownloadMime;
            String disposition = pendingDownloadDisposition;
            pendingDownloadUrl = pendingDownloadMime = pendingDownloadDisposition = null;
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED)
                download(url, disposition, mime);
            else openExternal(Uri.parse(url));
        }
    }
    private int dp(int px) { return Math.round(px * getResources().getDisplayMetrics().density); }
    private void evaluate(String javaScript) {
        if (webView != null && errorView.getVisibility() != View.VISIBLE) webView.evaluateJavascript(javaScript, null);
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() != KeyEvent.ACTION_DOWN || webView == null || errorView.getVisibility() == View.VISIBLE)
            return super.dispatchKeyEvent(event);
        String direction = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_LEFT: direction = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: direction = "right"; break;
            case KeyEvent.KEYCODE_DPAD_UP: direction = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: direction = "down"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                evaluate("if(window.Samee3TVNav){window.Samee3TVNav.activate()}");
                return true;
            default: return super.dispatchKeyEvent(event);
        }
        evaluate("if(window.Samee3TVNav){window.Samee3TVNav.move('" + direction + "')}");
        return true;
    }
    @Override public void onBackPressed() {
        if (errorView.getVisibility() == View.VISIBLE) {
            errorView.setVisibility(View.GONE);
            webView.loadUrl(HOME_URL);
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (webView != null) webView.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }
    @Override protected void onDestroy() {
        if (webView != null) {
            root.removeView(webView);
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
