package com.codex.mobile;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CodexBridge — JavaScript Interface for native ↔ WebView communication.
 * <p>
 * Exposed to JavaScript as <code>window.CodexNative</code> and called directly
 * from the web layer.  Every method annotated with {@link JavascriptInterface}
 * is callable from JS.  Because all JS → Java calls arrive on a private
 * background thread, file I/O methods do <strong>not</strong> block the UI.
 * <p>
 * Feature mapping to the existing PWA's {@code android-features.js}:
 * <table>
 *   <tr><th>JS Method</th><th>Native Implementation</th></tr>
 *   <tr><td>vibrate(pattern)</td><td>{@link #vibrate(String)}</td></tr>
 *   <tr><td>requestWakeLock()</td><td>{@link #requestWakeLock()}</td></tr>
 *   <tr><td>releaseWakeLock()</td><td>{@link #releaseWakeLock()}</td></tr>
 *   <tr><td>copy(text)</td><td>{@link #copyToClipboard(String)}</td></tr>
 *   <tr><td>share(title, text)</td><td>{@link #share(String, String)}</td></tr>
 *   <tr><td>readFile(path)</td><td>{@link #readFile(String)}</td></tr>
 *   <tr><td>writeFile(path, content)</td><td>{@link #writeFile(String, String)}</td></tr>
 *   <tr><td>patchFile(path, old, new)</td><td>{@link #patchFile(String, String, String)}</td></tr>
 *   <tr><td>listFiles(path)</td><td>{@link #listFiles(String)}</td></tr>
 *   <tr><td>searchFiles(query, path)</td><td>{@link #searchFiles(String, String)}</td></tr>
 *   <tr><td>runCommand(cmd)</td><td>{@link #runCommand(String)}</td></tr>
 * </table>
 *
 * @author Codex Mobile Team
 * @version 2.0
 */
public class CodexBridge {

    private static final String TAG = "CodexBridge";

    /** Maximum characters to return from readFile (matches the JS agent's 50K limit). */
    private static final int MAX_FILE_READ_CHARS = 50_000;

    /** Command execution timeout in milliseconds. */
    private static final long COMMAND_TIMEOUT_MS = 30_000L;

    private final Context context;
    private final android.webkit.WebView webView;
    private final ExecutorService ioExecutor;

    // ─────────────────────────────────────────────────────────────────────
    // Wake Lock management
    // ─────────────────────────────────────────────────────────────────────

    private PowerManager.WakeLock wakeLock;
    private volatile boolean wakeLockWanted = false;

    // ─────────────────────────────────────────────────────────────────────
    // Event bus: stores pending events until JS is ready to receive them
    // ─────────────────────────────────────────────────────────────────────

    private final ConcurrentHashMap<String, List<String>> eventListeners = new ConcurrentHashMap<>();

    public CodexBridge(Context context, android.webkit.WebView webView) {
        this.context = context.getApplicationContext();
        this.webView = webView;
        this.ioExecutor = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "codex-io");
            t.setDaemon(true);
            t.setPriority(Thread.NORM_PRIORITY - 1);
            return t;
        });
    }

    // ═════════════════════════════════════════════════════════════════════
    //  INTERNAL — JS-callable but meant for the bridge itself
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Called from JS to mark the bridge as ready. Flushes any queued events.
     */
    @JavascriptInterface
    public void _onReady() {
        Log.i(TAG, "JS bridge ready — CodexNative connected");
    }

    /**
     * Emit an event to registered JS listeners. Called from Java to push
     * updates (e.g. from AgentService) into the web UI.
     */
    public void _emit(String eventType, String payloadJson) {
        postToJs("window.CodexNative && CodexNative._dispatch && CodexNative._dispatch("
                + JSONObject.quote(eventType) + ", " + payloadJson + ")");
    }

    // ═════════════════════════════════════════════════════════════════════
    //  HAPTIC FEEDBACK
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Trigger native haptic feedback.
     *
     * @param pattern JSON representing either a single duration (number) or
     *                an array of [on, off, on, off, ...] durations in ms.
     *                Also accepts named presets: "light", "medium", "heavy",
     *                "success", "error", "warning".
     * @return true if vibration was performed.
     */
    @JavascriptInterface
    public boolean vibrate(String pattern) {
        if (!hasPermission(Manifest.permission.VIBRATE)) {
            Log.w(TAG, "VIBRATE permission not granted");
            return false;
        }

        try {
            long[] patternArray = parseVibrationPattern(pattern);
            if (patternArray == null || patternArray.length == 0) return false;

            Vibrator vibrator = getVibrator();
            if (vibrator == null || !vibrator.hasVibrator()) return false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (patternArray.length == 1) {
                    vibrator.vibrate(VibrationEffect.createOneShot(
                            patternArray[0], VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(VibrationEffect.createWaveform(patternArray, -1));
                }
            } else {
                // Deprecated but necessary for API < 26
                vibrator.vibrate(patternArray, -1);
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "vibrate() failed", e);
            return false;
        }
    }

    private long[] parseVibrationPattern(String pattern) {
        if (pattern == null || pattern.isEmpty()) return new long[]{0};

        // Named presets
        switch (pattern) {
            case "light":   return new long[]{0, 10};
            case "medium":  return new long[]{0, 30};
            case "heavy":   return new long[]{0, 50};
            case "success": return new long[]{0, 10, 30, 10};
            case "error":   return new long[]{0, 50, 50, 50};
            case "warning": return new long[]{0, 30, 20, 30, 20, 30};
            default: break;
        }

        try {
            // Try parsing as JSON number or array
            pattern = pattern.trim();
            if (pattern.startsWith("[")) {
                JSONArray arr = new JSONArray(pattern);
                long[] result = new long[arr.length()];
                for (int i = 0; i < arr.length(); i++) {
                    result[i] = arr.getLong(i);
                }
                return result;
            } else {
                // Single number
                return new long[]{0, Long.parseLong(pattern)};
            }
        } catch (JSONException | NumberFormatException e) {
            return new long[]{0};
        }
    }

    @SuppressWarnings("deprecation")
    private Vibrator getVibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        } else {
            return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  WAKE LOCK
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Acquire a PARTIAL_WAKE_LOCK to keep the CPU running during long agent
     * tasks. The screen wake lock (FLAG_KEEP_SCREEN_ON) is managed by the
     * Activity; this method handles CPU wake.
     *
     * @return true if the lock was acquired.
     */
    @JavascriptInterface
    public boolean requestWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            return true; // already held
        }
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return false;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CodexMobile::AgentWakeLock");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(10 * 60 * 1000L); // 10-minute safety cap
            wakeLockWanted = true;
            Log.i(TAG, "Wake lock acquired");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock", e);
            return false;
        }
    }

    /**
     * Release the previously acquired wake lock.
     */
    @JavascriptInterface
    public void releaseWakeLock() {
        wakeLockWanted = false;
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
                Log.i(TAG, "Wake lock released");
            } catch (Exception e) {
                Log.w(TAG, "Error releasing wake lock", e);
            }
        }
        wakeLock = null;
    }

    // ═════════════════════════════════════════════════════════════════════
    //  CLIPBOARD
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Copy text to the system clipboard.
     *
     * @return true on success.
     */
    @JavascriptInterface
    public boolean copyToClipboard(String text) {
        try {
            ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null) return false;
            ClipData clip = ClipData.newPlainText("Codex", text);
            cm.setPrimaryClip(clip);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Clipboard copy failed", e);
            return false;
        }
    }

    /**
     * Read text from the system clipboard (API 29+ requires foreground).
     *
     * @return the clipboard text, or empty string if unavailable.
     */
    @JavascriptInterface
    public String getClipboard() {
        try {
            ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData.Item item = cm.getPrimaryClip().getItemAt(0);
            return item != null && item.getText() != null ? item.getText().toString() : "";
        } catch (Exception e) {
            Log.w(TAG, "Clipboard read failed", e);
            return "";
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  SHARING
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Open the native share sheet for text content.
     *
     * @param title share title
     * @param text  share body
     * @return true if the share intent was launched.
     */
    @JavascriptInterface
    public boolean share(String title, String text) {
        try {
            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType("text/plain");
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, title != null ? title : "Codex");
            sendIntent.putExtra(Intent.EXTRA_TEXT, text != null ? text : "");
            sendIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(Intent.createChooser(sendIntent, "分享 — Codex")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (Exception e) {
            Log.e(TAG, "share() failed", e);
            return false;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  TOAST
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Show a native Android toast notification.
     *
     * @param message the message to display
     * @param duration "short" (default) or "long"
     */
    @JavascriptInterface
    public void showToast(String message, String duration) {
        int len = "long".equalsIgnoreCase(duration) ? Toast.LENGTH_LONG : Toast.LENGTH_SHORT;
        Toast.makeText(context, message != null ? message : "", len).show();
    }

    // ═════════════════════════════════════════════════════════════════════
    //  FILE SYSTEM — Project sandbox (maps to the JS agent's 8 tools)
    // ═════════════════════════════════════════════════════════════════════

    /**
     * The root directory of the user's project sandbox. Files created by the
     * agent are stored under {@code getExternalFilesDir()/workspace/}.
     */
    private File getProjectRoot() {
        File root = new File(context.getExternalFilesDir(null), "workspace");
        if (!root.exists()) root.mkdirs();
        return root;
    }

    /**
     * Resolve a sandboxed path, preventing path traversal outside the project root.
     */
    private File resolvePath(String relativePath) throws IOException {
        File base = getProjectRoot();
        String cleaned = relativePath == null ? "" : relativePath.replace("\\", "/");
        while (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        File resolved = new File(base, cleaned);
        String canonicalBase = base.getCanonicalPath();
        String canonicalResolved = resolved.getCanonicalPath();
        if (!canonicalResolved.startsWith(canonicalBase)) {
            throw new IOException("Path traversal detected: " + relativePath);
        }
        return resolved;
    }

    /**
     * Read a file from the project sandbox.
     *
     * @param relativePath path relative to the workspace root.
     * @return file content (up to {@value #MAX_FILE_READ_CHARS} chars), or
     *         a JSON error string if the file doesn't exist.
     */
    @JavascriptInterface
    public String readFile(String relativePath) {
        try {
            File file = resolvePath(relativePath);
            if (!file.exists() || !file.isFile()) {
                return errorJson("File not found: " + relativePath);
            }
            BufferedReader reader = new BufferedReader(new FileReader(file));
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            int n;
            while ((n = reader.read(buf)) != -1) {
                sb.append(buf, 0, n);
                if (sb.length() > MAX_FILE_READ_CHARS) {
                    sb.append("\n... [truncated at ").append(MAX_FILE_READ_CHARS).append(" chars]");
                    break;
                }
            }
            reader.close();
            return sb.toString();
        } catch (IOException e) {
            Log.e(TAG, "readFile failed: " + relativePath, e);
            return errorJson(e.getMessage());
        }
    }

    /**
     * Write (create or overwrite) a file in the sandbox.
     *
     * @param relativePath destination path
     * @param content      full file content
     * @return JSON result: {"ok":true,"bytes":N} or {"ok":false,"error":"..."}
     */
    @JavascriptInterface
    public String writeFile(String relativePath, String content) {
        try {
            File file = resolvePath(relativePath);
            File parent = file.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();

            FileWriter writer = new FileWriter(file, false);
            writer.write(content != null ? content : "");
            writer.flush();
            writer.close();

            int bytes = content != null ? content.length() : 0;
            Log.d(TAG, "writeFile: " + relativePath + " (" + bytes + " bytes)");
            return okJson("bytes", bytes);
        } catch (IOException e) {
            Log.e(TAG, "writeFile failed: " + relativePath, e);
            return errorJson(e.getMessage());
        }
    }

    /**
     * Apply a targeted find-and-replace edit to an existing file.
     *
     * @param relativePath  target file
     * @param oldString     exact string to find (must be unique)
     * @param newString     replacement text
     * @return JSON result with {@code ok} flag.
     */
    @JavascriptInterface
    public String patchFile(String relativePath, String oldString, String newString) {
        try {
            File file = resolvePath(relativePath);
            if (!file.exists()) return errorJson("File not found: " + relativePath);

            String content = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            if (!content.contains(oldString)) {
                return errorJson("old_string not found in " + relativePath);
            }

            // Check uniqueness
            int occurrences = countOccurrences(content, oldString);
            if (occurrences > 1) {
                return errorJson("old_string appears " + occurrences + " times in "
                        + relativePath + ". Provide more context for uniqueness.");
            }

            String updated = content.replace(oldString, newString);
            FileWriter writer = new FileWriter(file, false);
            writer.write(updated);
            writer.flush();
            writer.close();

            Log.d(TAG, "patchFile: " + relativePath + " (replaced "
                    + oldString.length() + " → " + newString.length() + " chars)");
            return okJson();
        } catch (IOException e) {
            Log.e(TAG, "patchFile failed: " + relativePath, e);
            return errorJson(e.getMessage());
        }
    }

    /**
     * List the contents of a directory in the sandbox.
     *
     * @param relativePath directory path (empty/"/" for root).
     * @return JSON array of {name, type, size}.
     */
    @JavascriptInterface
    public String listFiles(String relativePath) {
        try {
            File dir = resolvePath(relativePath != null ? relativePath : "/");
            if (!dir.exists() || !dir.isDirectory()) {
                return errorJson("Not a directory: " + relativePath);
            }
            File[] children = dir.listFiles();
            if (children == null) return "[]";

            JSONArray arr = new JSONArray();
            // Sort: directories first, then alphabetical
            java.util.Arrays.sort(children, (a, b) -> {
                if (a.isDirectory() != b.isDirectory()) {
                    return a.isDirectory() ? -1 : 1;
                }
                return a.getName().compareToIgnoreCase(b.getName());
            });

            for (File child : children) {
                JSONObject entry = new JSONObject();
                entry.put("name", child.getName());
                entry.put("type", child.isDirectory() ? "dir" : "file");
                if (child.isFile()) {
                    entry.put("size", child.length());
                }
                arr.put(entry);
            }
            return arr.toString();
        } catch (Exception e) {
            Log.e(TAG, "listFiles failed", e);
            return errorJson(e.getMessage());
        }
    }

    /**
     * Search for a text pattern across files in the sandbox.
     *
     * @param query      search text or regex pattern
     * @param relativePath directory to limit the search scope (optional)
     * @return JSON array of {file, line, content} matches.
     */
    @JavascriptInterface
    public String searchFiles(String query, String relativePath) {
        try {
            File searchRoot = resolvePath(relativePath != null && !relativePath.isEmpty()
                    ? relativePath : "/");

            Pattern regex;
            try {
                regex = Pattern.compile(query);
            } catch (Exception e) {
                // Fall back to literal matching
                regex = Pattern.compile(Pattern.quote(query));
            }

            List<JSONObject> results = new ArrayList<>();
            searchRecursive(searchRoot, regex, query, searchRoot, results, 500);

            JSONArray arr = new JSONArray();
            for (JSONObject r : results) arr.put(r);
            return arr.toString();
        } catch (Exception e) {
            Log.e(TAG, "searchFiles failed", e);
            return errorJson(e.getMessage());
        }
    }

    private void searchRecursive(File dir, Pattern regex, String literalQuery,
                                 File projectRoot, List<JSONObject> results, int maxResults) throws IOException {
        if (results.size() >= maxResults) return;
        File[] children = dir.listFiles();
        if (children == null) return;

        for (File child : children) {
            if (results.size() >= maxResults) return;
            if (child.isDirectory()) {
                // Skip hidden and build directories
                if (!child.getName().startsWith(".") && !child.getName().equals("node_modules")) {
                    searchRecursive(child, regex, literalQuery, projectRoot, results, maxResults);
                }
            } else if (child.isFile() && child.length() < 5_000_000) {
                // Skip binary files by checking first bytes
                if (isLikelyBinary(child)) continue;

                try (BufferedReader reader = new BufferedReader(new FileReader(child))) {
                    String line;
                    int lineNum = 0;
                    while ((line = reader.readLine()) != null) {
                        lineNum++;
                        boolean match = regex.matcher(line).find()
                                || line.contains(literalQuery);
                        if (match) {
                            String relPath = projectRoot.toPath()
                                    .relativize(child.toPath()).toString();
                            JSONObject entry = new JSONObject();
                            entry.put("file", relPath);
                            entry.put("line", lineNum);
                            entry.put("content", line.trim());
                            results.add(entry);
                            if (results.size() >= maxResults) return;
                        }
                    }
                }
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  COMMAND EXECUTION (sandboxed)
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Execute a shell command in the project sandbox.
     * <p>
     * For safety, this executes in the app's sandbox directory (no root).
     * Only a limited whitelist of commands is permitted.
     *
     * @param command the shell command to run
     * @return JSON: {"stdout":"...","stderr":"...","exitCode":N}
     */
    @JavascriptInterface
    public String runCommand(String command) {
        try {
            if (command == null || command.trim().isEmpty()) {
                return errorJson("Empty command");
            }

            String[] parts = command.trim().split("\\s+", 2);
            String baseCmd = parts[0];

            // Whitelist of allowed commands (security)
            List<String> allowed = java.util.Arrays.asList(
                    "echo", "pwd", "ls", "cat", "grep", "find", "wc",
                    "date", "whoami", "uname", "git", "node", "npm",
                    "python3", "java", "javac", "mkdir", "cp", "mv"
            );
            if (!allowed.contains(baseCmd)) {
                JSONObject res = new JSONObject();
                res.put("stdout", "");
                res.put("stderr", "Command '" + baseCmd + "' not in allowlist");
                res.put("exitCode", 127);
                return res.toString();
            }

            ProcessBuilder pb = new ProcessBuilder("/system/bin/sh", "-c", command);
            pb.directory(getProjectRoot());
            pb.redirectErrorStream(false);

            Process process = pb.start();

            // Read output on the IO executor to avoid blocking
            java.io.InputStream stdout = process.getInputStream();
            java.io.InputStream stderr = process.getErrorStream();

            StringBuilder outBuf = new StringBuilder();
            StringBuilder errBuf = new StringBuilder();

            byte[] buffer = new byte[8192];
            int n;
            while ((n = stdout.read(buffer)) != -1) {
                outBuf.append(new String(buffer, 0, n, StandardCharsets.UTF_8));
                if (outBuf.length() > MAX_FILE_READ_CHARS) {
                    outBuf.append("... [truncated]");
                    break;
                }
            }
            while ((n = stderr.read(buffer)) != -1) {
                errBuf.append(new String(buffer, 0, n, StandardCharsets.UTF_8));
            }

            boolean finished = process.waitFor(COMMAND_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS);
            int exitCode;
            if (!finished) {
                process.destroyForcibly();
                exitCode = -1;
                errBuf.append("\n[timeout after ").append(COMMAND_TIMEOUT_MS).append("ms]");
            } else {
                exitCode = process.exitValue();
            }

            JSONObject res = new JSONObject();
            res.put("stdout", outBuf.toString());
            res.put("stderr", errBuf.toString());
            res.put("exitCode", exitCode);
            return res.toString();
        } catch (Exception e) {
            Log.e(TAG, "runCommand failed: " + command, e);
            return errorJson(e.getMessage());
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  SYSTEM INFO
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Return device/system information as JSON.
     */
    @JavascriptInterface
    public String getSystemInfo() {
        try {
            JSONObject info = new JSONObject();
            info.put("platform", "android");
            info.put("manufacturer", Build.MANUFACTURER);
            info.put("model", Build.MODEL);
            info.put("osVersion", Build.VERSION.RELEASE);
            info.put("sdkInt", Build.VERSION.SDK_INT);
            info.put("isLowRamDevice", isLowRamDevice());
            info.put("freeSpace", getProjectRoot().getFreeSpace());
            info.put("totalSpace", getProjectRoot().getTotalSpace());
            return info.toString();
        } catch (JSONException e) {
            return errorJson(e.getMessage());
        }
    }

    /**
     * Check whether the device has an active network connection.
     *
     * @return true if online.
     */
    @JavascriptInterface
    public boolean isOnline() {
        android.net.ConnectivityManager cm =
                (android.net.ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        android.net.NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnectedOrConnecting();
    }

    // ═════════════════════════════════════════════════════════════════════
    //  AGENT SERVICE CONTROL
    // ═════════════════════════════════════════════════════════════════════

    /**
     * Start the foreground agent service (keeps the app alive in background).
     */
    @JavascriptInterface
    public void startAgentService() {
        if (context instanceof MainActivity) {
            ((MainActivity) context).startAgentService();
        }
    }

    /**
     * Stop the foreground agent service.
     */
    @JavascriptInterface
    public void stopAgentService() {
        if (context instanceof MainActivity) {
            ((MainActivity) context).stopAgentService();
        }
    }

    /**
     * 显示系统通知（通知栏）
     * @param title 通知标题
     * @param text  通知内容
     */
    @JavascriptInterface
    public void showNotification(String title, String text) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            String channelId = "codex_agent_channel";
            if (nm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channelId) == null) {
                    NotificationChannel channel = new NotificationChannel(channelId, "Codex Agent", NotificationManager.IMPORTANCE_DEFAULT);
                    channel.setDescription("Codex Agent 任务通知");
                    nm.createNotificationChannel(channel);
                }
                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title != null ? title : "Codex")
                    .setContentText(text != null ? text : "")
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);
                nm.notify((int) System.currentTimeMillis(), builder.build());
            }
        } catch (Exception e) {
            Log.e("CodexBridge", "showNotification error", e);
        }
    }

    /**
     * 下载文件到 Downloads 目录
     */
    @JavascriptInterface
    public void downloadFile(String filename, String content) {
        try {
            java.io.FileOutputStream fos = context.openFileOutput(filename, Context.MODE_PRIVATE);
            fos.write(content.getBytes());
            fos.close();
        } catch (Exception e) {
            Log.e("CodexBridge", "downloadFile error", e);
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  HELPERS
    // ═════════════════════════════════════════════════════════════════════

    private void postToJs(String script) {
        if (webView != null) {
            webView.post(() -> {
                if (webView != null) {
                    webView.evaluateJavascript(script, null);
                }
            });
        }
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isLowRamDevice() {
        try {
            ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            return am != null && am.isLowRamDevice();
        } catch (Exception e) {
            return false;
        }
    }

    private static int countOccurrences(String haystack, String needle) {
        int count = 0;
        int idx = 0;
        while ((idx = haystack.indexOf(needle, idx)) != -1) {
            count++;
            idx += needle.length();
        }
        return count;
    }

    private static boolean isLikelyBinary(File file) {
        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) {
            byte[] sample = new byte[Math.min(1024, (int) file.length())];
            int read = fis.read(sample);
            for (int i = 0; i < read; i++) {
                if (sample[i] == 0) return true; // null byte → binary
            }
            return false;
        } catch (IOException e) {
            return true;
        }
    }

    private static String okJson() {
        return "{\"ok\":true}";
    }

    private static String okJson(String key, Object value) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("ok", true);
            obj.put(key, value);
            return obj.toString();
        } catch (JSONException e) {
            return "{\"ok\":true}";
        }
    }

    private static String errorJson(String message) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("ok", false);
            obj.put("error", message != null ? message : "Unknown error");
            return obj.toString();
        } catch (JSONException e) {
            return "{\"ok\":false,\"error\":\"JSON error\"}";
        }
    }
}
