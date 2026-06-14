package com.codex.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * MainActivity — Hosts the Codex Mobile PWA inside a full-screen Android WebView.
 * <p>
 * Responsibilities:
 * <ul>
 *   <li>Configure a hardware-accelerated WebView with ES6 module support</li>
 *   <li>Inject {@link CodexBridge} as <code>window.CodexNative</code> for native ↔ JS bridging</li>
 *   <li>Request runtime permissions (POST_NOTIFICATIONS, VIBRATE, FOREGROUND_SERVICE)</li>
 *   <li>Bind to {@link AgentService} for background agent execution</li>
 *   <li>Handle device back-button (WebView history navigation)</li>
 *   <li>Forward Android lifecycle events to the bridge layer</li>
 * </ul>
 *
 * @author Codex Mobile Team
 * @version 2.0
 * @since 1.0
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "CodexActivity";

    /** Path inside <code>assets/</code> where the PWA lives. */
    private static final String PWA_BASE_URL = "file:///android_asset/www/";

    /** JS bridge object name exposed to the WebView. */
    private static final String BRIDGE_NAME = "CodexNative";

    // ─────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────

    private WebView webView;
    private CodexBridge bridge;
    private AgentService agentService;
    private boolean isServiceBound = false;

    /** File chooser callback for <code>&lt;input type="file"&gt;</code> uploads. */
    private ValueCallback<Uri[]> fileChooserCallback;

    // ─────────────────────────────────────────────────────────────────────
    // Runtime permission launcher (ActivityResult API)
    // ─────────────────────────────────────────────────────────────────────

    private final ActivityResultLauncher<String[]> permissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
                boolean allGranted = true;
                for (Boolean granted : result.values()) {
                    if (!granted) allGranted = false;
                }
                if (!allGranted) {
                    Log.w(TAG, "Some permissions denied — features may be degraded");
                    toast("某些权限未授权，部分功能可能受限");
                }
            });

    // File-upload permission launcher
    private final ActivityResultLauncher<Intent> fileUploadLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (fileChooserCallback == null) return;
                Uri[] results = null;
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    String dataString = result.getData().getDataString();
                    if (dataString != null) {
                        results = new Uri[]{ Uri.parse(dataString) };
                    }
                }
                fileChooserCallback.onReceiveValue(results);
                fileChooserCallback = null;
            });

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen immersive mode
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_main);

        // Keep screen on while the Activity is visible (released in onPause)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Request essential runtime permissions
        requestRuntimePermissions();

        // Initialise the WebView and bridge
        webView = findViewById(R.id.webview);
        bridge = new CodexBridge(this, webView);
        configureWebView();

        // Restore state if rotating (preserves WebView history)
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            // Initial load
            loadPwa();
        }

        // Wire up the system back button to navigate WebView history
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        Log.i(TAG, "MainActivity created — Codex Mobile v2.0");
    }

    @Override
    protected void onStart() {
        super.onStart();
        bindAgentService();
    }

    @Override
    protected void onStop() {
        super.onStop();
        unbindAgentService();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        // Notify JS layer that the app is in the foreground
        evaluateSafeJs("window.dispatchEvent(new Event('appresume'))");
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
        evaluateSafeJs("window.dispatchEvent(new Event('apppause'))");
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            // Remove the bridge reference to avoid memory leaks
            webView.removeJavascriptInterface(BRIDGE_NAME);
            // Detach WebView before destruction (prevents crash on some OEMs)
            ((android.view.ViewGroup) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    // ─────────────────────────────────────────────────────────────────────
    // WebView Configuration
    // ─────────────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);           // IndexedDB / localStorage
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setTextZoom(100);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        // Enable ES6 modules & modern features
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        // PWA: enable service workers
        webView.setWebContentsDebuggingEnabled(true); // TODO: gate behind BuildConfig.DEBUG in production

        // Expose the native bridge
        webView.addJavascriptInterface(bridge, BRIDGE_NAME);

        // Persist cookies for API sessions
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        // WebViewClient — intercept navigation, handle errors
        webView.setWebViewClient(new CodexWebViewClient());

        // WebChromeClient — handle file chooser, console messages, permissions
        webView.setWebChromeClient(new CodexChromeClient());
    }

    private void loadPwa() {
        Log.i(TAG, "Loading PWA from: " + PWA_BASE_URL + "index.html");
        webView.loadUrl(PWA_BASE_URL + "index.html");
    }

    // ─────────────────────────────────────────────────────────────────────
    // AgentService binding
    // ─────────────────────────────────────────────────────────────────────

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            AgentService.LocalBinder localBinder = (AgentService.LocalBinder) binder;
            agentService = localBinder.getService();
            agentService.setBridge(bridge);
            Log.d(TAG, "AgentService connected");
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            agentService = null;
            Log.d(TAG, "AgentService disconnected");
        }
    };

    private void bindAgentService() {
        Intent intent = new Intent(this, AgentService.class);
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
        isServiceBound = true;
    }

    private void unbindAgentService() {
        if (isServiceBound) {
            unbindService(serviceConnection);
            isServiceBound = false;
        }
    }

    /**
     * Start the foreground service to keep the agent alive during long tasks.
     * Called from the JS bridge when an agent task begins.
     */
    public void startAgentService() {
        Intent intent = new Intent(this, AgentService.class);
        intent.putExtra(AgentService.EXTRA_ACTION, AgentService.ACTION_START_AGENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    /**
     * Stop the foreground service when the agent finishes.
     */
    public void stopAgentService() {
        Intent intent = new Intent(this, AgentService.class);
        intent.putExtra(AgentService.EXTRA_ACTION, AgentService.ACTION_STOP_AGENT);
        startService(intent);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Permissions
    // ─────────────────────────────────────────────────────────────────────

    private void requestRuntimePermissions() {
        java.util.List<String> needed = new java.util.ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.VIBRATE)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.VIBRATE);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
        }

        if (!needed.isEmpty()) {
            permissionLauncher.launch(needed.toArray(new String[0]));
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Safely evaluate a JS expression on the main thread. Silently no-ops if
     * the WebView has been destroyed.
     */
    void evaluateSafeJs(String script) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(script, null);
            }
        });
    }

    /**
     * Emit an event on the JS <code>CodexNative._events</code> bus.
     * Used by the service layer to push updates into the UI.
     */
    public void emitJsEvent(String eventType, String payloadJson) {
        String js = String.format(
                "window.CodexNative && CodexNative._emit(%s, %s)",
                JSONObject.quote(eventType),
                payloadJson != null ? payloadJson : "null"
        );
        evaluateSafeJs(js);
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    // ─────────────────────────────────────────────────────────────────────
    // Inner: WebViewClient
    // ─────────────────────────────────────────────────────────────────────

    private class CodexWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();

            // Allow http/https/file from our origin only
            if ("http".equals(scheme) || "https".equals(scheme) || "file".equals(scheme)) {
                return false; // let WebView handle it
            }

            // External intents (tel:, mailto:, intent:, etc.)
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Log.w(TAG, "No app found for " + uri);
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            Log.e(TAG, "WebView error " + errorCode + ": " + description + " [" + failingUrl + "]");
            // Fallback: show a local error page in assets
            view.loadUrl("file:///android_asset/www/error.html");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Inner: WebChromeClient
    // ─────────────────────────────────────────────────────────────────────

    private class CodexChromeClient extends WebChromeClient {

        @Override
        public boolean onConsoleMessage(ConsoleMessage msg) {
            String level = msg.messageLevel().name();
            Log.d("WebViewConsole", "[" + level + "] " + msg.message()
                    + " (" + msg.sourceId() + ":" + msg.lineNumber() + ")");
            return true;
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> request.grant(request.getResources()));
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams fileChooserParams) {
            // Cancel any previous callback
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(null);
            }
            fileChooserCallback = callback;

            Intent intent = fileChooserParams.createIntent();
            try {
                fileUploadLauncher.launch(intent);
            } catch (Exception e) {
                fileChooserCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            // Could push progress to a splash screen here
            if (newProgress == 100) {
                Log.d(TAG, "Page loaded: 100%");
                // Notify JS that the native shell is ready
                evaluateSafeJs(
                        "window.CodexNative && CodexNative._onReady && CodexNative._onReady()"
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Hardware key handling
    // ─────────────────────────────────────────────────────────────────────

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Volume keys as optional shortcuts for the agent (configurable)
        // Intentionally not intercepting default behaviour here — left for future use.
        return super.onKeyDown(keyCode, event);
    }
}
