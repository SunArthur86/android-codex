# Codex Mobile — ProGuard rules
# Keep WebView JavaScript interface and WebView client classes

-keepclassmembers class com.codex.mobile.** {
    public *;
}

# Keep AndroidFeatures JS bridge
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
