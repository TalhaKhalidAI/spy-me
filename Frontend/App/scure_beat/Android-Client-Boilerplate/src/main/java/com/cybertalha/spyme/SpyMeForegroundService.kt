package com.cybertalha.spyme

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

class SpyMeForegroundService : Service() {

    private val CHANNEL_ID = "SpyMeServiceChannel"
    private val NOTIFICATION_ID = 1

    private lateinit var mediasoupManager: MediasoupManager

    override fun onCreate() {
        super.onCreate()
        Log.d("SpyMeService", "Service Created")
        createNotificationChannel()
        
        // Initialize WebRTC and Socket.io manager
        mediasoupManager = MediasoupManager(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("SpyMeService", "Service Started")

        // Start Foreground Service to prevent Android from killing it
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SpyMe Background Service")
            .setContentText("Maintaining uplink and WebRTC connection...")
            // Replace with your actual drawable icon: .setSmallIcon(R.drawable.ic_stat_name)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)

        // Extract token/roomId/username from intent
        val roomId = intent?.getStringExtra("ROOM_ID") ?: "default_room"
        val token = intent?.getStringExtra("TOKEN") ?: ""
        val username = intent?.getStringExtra("USERNAME") ?: "AndroidClient"
        val backendUrl = intent?.getStringExtra("BACKEND_URL") ?: "https://your-api.com:3000"
        val wsUrl = intent?.getStringExtra("WS_URL") ?: "wss://your-api.com:3000"
        
        // Connect to Socket.io backend and initialize Mediasoup
        mediasoupManager.connect(roomId, token, username, backendUrl, wsUrl)

        // START_STICKY tells OS to recreate the service if it is killed due to low memory
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d("SpyMeService", "Service Destroyed")
        mediasoupManager.disconnect()
    }

    override fun onBind(intent: Intent?): IBinder? {
        // We are using started service, not bound service
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "SpyMe Connection Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager: NotificationManager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }
}
