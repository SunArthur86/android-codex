# ─────────────────────────────────────────────────────────
# Codex Mobile — ProGuard / R8 Rules
# ─────────────────────────────────────────────────────────

# ── WebView JavaScript Interface ──
# The CodexBridge class is injected into the WebView as window.CodexNative.
# All @JavascriptInterface methods must be preserved with their original names
# so JavaScript can call them at runtime.
-keepclassmembers class com.codex.mobile.CodexBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep @interface android.webkit.JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── AgentService ──
# The LocalBinder and public API methods are accessed via reflection from
# the ServiceConnection; keep them intact.
-keep class com.codex.mobile.AgentService$LocalBinder { *; }
-keep class com.codex.mobile.AgentService { *; }

# ── MainActivity ──
# Inner classes used by WebView clients must not be stripped or renamed.
-keep class com.codex.mobile.MainActivity$CodexWebViewClient { *; }
-keep class com.codex.mobile.MainActivity$CodexChromeClient { *; }

# ── JSON (org.json) ──
# org.json is part of the Android platform; keep its public API.
-dontwarn org.json.**

# ── WebView / WebKit ──
-keep class android.webkit.** { *; }
-dontwarn android.webkit.**

# ── AndroidX ──
-dontwarn androidx.activity.**
-dontwarn androidx.core.**

# ── Strip logging in release builds ──
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}
