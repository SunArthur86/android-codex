package com.codex.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

/**
 * AgentService — Foreground Service for background agent execution.
 * <p>
 * Keeps the Codex agent alive when the user switches to another app or the
 * screen turns off.  During agent tasks the service:
 * <ul>
 *   <li>Displays a persistent notification with current status/progress</li>
 *   <li>Holds a {@link PowerManager#PARTIAL_WAKE_LOCK} to prevent CPU sleep</li>
 *   <li>Runs agent tasks on a dedicated background thread</li>
 *   <li>Pushes status updates to the UI via the bridge's event bus</li>
 * </ul>
 *
 * <h3>Lifecycle</h3>
 * <pre>
 *   JS: CodexNative.startAgentService()
 *     → Activity.startAgentService()
 *       → startForegroundService(intent)
 *         → onCreate(): create channel + initial notification
 *         → onStartCommand(): become foreground, start processing
 *
 *   JS: CodexNative.stopAgentService()
 *     → Activity.stopAgentService()
 *       → startService(intent with ACTION_STOP_AGENT)
 *         → stopSelf()
 * </pre>
 *
 * @author Codex Mobile Team
 * @version 2.0
 */
public class AgentService extends Service {

    private static final String TAG = "AgentService";

    // ── Notification IDs ──
    static final String CHANNEL_ID = "codex_agent_channel";
    static final String CHANNEL_NAME = "Codex Agent";
    private static final int NOTIFICATION_ID = 0xC0DEX; // unique ID

    // ── Intent extras ──
    static final String EXTRA_ACTION = "action";
    static final String EXTRA_STATUS = "status";
    static final String EXTRA_MESSAGE = "message";

    // ── Action constants ──
    static final String ACTION_START_AGENT = "START_AGENT";
    static final String ACTION_STOP_AGENT = "STOP_AGENT";
    static final String ACTION_UPDATE_STATUS = "UPDATE_STATUS";

    // ── Wake lock timeout safety cap (10 min) ──
    private static final long WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L;

    // ─────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────

    private PowerManager.WakeLock wakeLock;
    private CodexBridge bridge;
    private final LocalBinder binder = new LocalBinder();
    private HandlerThread workerThread;
    private Handler workerHandler;

    private String currentStatus = "Idle";
    private String currentMessage = "";
    private int currentIteration = 0;
    private int maxIterations = 25;

    // ─────────────────────────────────────────────────────────────────────
    // Binder
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Allows the Activity to obtain a reference to this service.
     */
    public class LocalBinder extends Binder {
        public AgentService getService() {
            return AgentService.this;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public boolean onUnbind(Intent intent) {
        return true; // allow rebind
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public API (called via the binder from MainActivity)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Set the bridge reference so the service can push events to JS.
     */
    public void setBridge(CodexBridge bridge) {
        this.bridge = bridge;
    }

    /**
     * Update the notification content and notify JS.
     *
     * @param status    short status label (e.g. "Reasoning", "Tool: write_file")
     * @param message   optional detail message
     * @param iteration current iteration number (0-based)
     * @param max       maximum iterations allowed
     */
    public void updateStatus(String status, String message, int iteration, int max) {
        this.currentStatus = status != null ? status : "";
        this.currentMessage = message != null ? message : "";
        this.currentIteration = iteration;
        this.maxIterations = max;

        updateNotification();
        emitStatusEvent();
    }

    /**
     * Shortcut to update only the status label.
     */
    public void updateStatus(String status) {
        updateStatus(status, null, currentIteration, maxIterations);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "AgentService created");

        // Create notification channel (required for Android 8.0+)
        createNotificationChannel();

        // Start the worker thread for background tasks
        workerThread = new HandlerThread("CodexAgent", android.os.Process.THREAD_PRIORITY_BACKGROUND);
        workerThread.start();
        workerHandler = new Handler(workerThread.getLooper());

        // Display the initial notification
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // Service was restarted by the system after being killed
            Log.w(TAG, "Service restarted by system — restoring state");
            return START_STICKY;
        }

        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) action = ACTION_START_AGENT;

        switch (action) {
            case ACTION_START_AGENT:
                handleStartAgent(intent);
                break;

            case ACTION_STOP_AGENT:
                handleStopAgent();
                break;

            case ACTION_UPDATE_STATUS:
                String status = intent.getStringExtra(EXTRA_STATUS);
                String message = intent.getStringExtra(EXTRA_MESSAGE);
                updateStatus(status, message, currentIteration, maxIterations);
                break;

            default:
                Log.w(TAG, "Unknown action: " + action);
                break;
        }

        return START_STICKY; // restart if killed
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "AgentService destroyed");

        // Release the wake lock
        releaseWakeLock();

        // Clean up worker thread
        if (workerThread != null) {
            workerThread.quitSafely();
            workerThread = null;
        }

        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // User swiped the app from recents — stop the service
        Log.i(TAG, "Task removed — stopping service");
        releaseWakeLock();
        stopForeground(true);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Action handlers
    // ─────────────────────────────────────────────────────────────────────

    private void handleStartAgent(Intent intent) {
        Log.i(TAG, "Starting agent task");

        // Acquire wake lock to prevent CPU sleep
        acquireWakeLock();

        // Update notification
        updateStatus("Agent Running", "Initializing...", 0, maxIterations);

        // Emit a start event to JS
        if (bridge != null) {
            bridge._emit("agent:start", "{\"status\":\"running\"}");
        }
    }

    private void handleStopAgent() {
        Log.i(TAG, "Stopping agent task");

        releaseWakeLock();

        if (bridge != null) {
            bridge._emit("agent:stop", "{\"status\":\"stopped\"}");
        }

        stopForeground(true);
        stopSelf();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Wake Lock management
    // ─────────────────────────────────────────────────────────────────────

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;

            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CodexMobile::AgentServiceLock");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
            Log.i(TAG, "Service wake lock acquired");
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire service wake lock", e);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
                Log.i(TAG, "Service wake lock released");
            } catch (Exception e) {
                Log.w(TAG, "Error releasing service wake lock", e);
            }
        }
        wakeLock = null;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Notifications
    // ─────────────────────────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW  // no sound, visible in tray
            );
            channel.setDescription("Codex agent background execution status");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Build the foreground notification. Tapping it returns the user to MainActivity.
     */
    private Notification buildNotification() {
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, contentIntent, flags);

        // Stop action button
        Intent stopIntent = new Intent(this, AgentService.class);
        stopIntent.putExtra(EXTRA_ACTION, ACTION_STOP_AGENT);
        PendingIntent stopPending = PendingIntent.getService(this, 1, stopIntent, flags);

        // Build progress text
        String progressText = currentIteration > 0
                ? String.format("迭代 %d/%d", currentIteration, maxIterations)
                : currentMessage.isEmpty() ? "等待任务..." : currentMessage;

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("⬢ Codex Agent — " + currentStatus)
                .setContentText(progressText)
                .setSmallIcon(android.R.drawable.ic_dialog_info) // TODO: replace with R.drawable.ic_codex
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pendingIntent)
                .addAction(android.R.drawable.ic_media_pause, "停止", stopPending)
                .setProgress(maxIterations > 0 ? maxIterations : 0,
                        currentIteration,
                        currentIteration == 0) // indeterminate during init
                .setColor(0xFF2F81F7) // Codex blue
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .build();
    }

    /**
     * Rebuild and post the notification with current status.
     */
    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // JS event emission
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Push the current status to the JS layer via the bridge.
     */
    private void emitStatusEvent() {
        if (bridge == null) return;

        try {
            JSONObject payload = new JSONObject();
            payload.put("status", currentStatus);
            payload.put("message", currentMessage);
            payload.put("iteration", currentIteration);
            payload.put("maxIterations", maxIterations);
            payload.put("timestamp", System.currentTimeMillis());
            bridge._emit("agent:status", payload.toString());
        } catch (Exception e) {
            Log.e(TAG, "Failed to emit status event", e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Background task execution
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Post a task to run on the service's background thread.
     *
     * @param task the task to execute (should not touch UI directly).
     */
    public void postBackground(Runnable task) {
        if (workerHandler != null) {
            workerHandler.post(task);
        }
    }

    /**
     * Post a delayed task to the background thread.
     */
    public void postBackgroundDelayed(Runnable task, long delayMs) {
        if (workerHandler != null) {
            workerHandler.postDelayed(task, delayMs);
        }
    }
}
