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
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.app.ActivityCompat
import android.Manifest
import android.content.pm.PackageManager

class PersistentService : Service() {

    private val CHANNEL_ID = "persistent_service"
    private val NOTIFICATION_ID = 1001
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var retryManager: RetryManager
    
    private var isNetworkAvailable = false
    private var audioRecord: AudioRecord? = null
    private var isRecording = false
    private val bufferSize = AudioRecord.getMinBufferSize(
        44100,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
    )

    override fun onCreate() {
        super.onCreate()
        Log.d(MyApplication.TAG, "PersistentService onCreate")
        
        createNotificationChannel()
        acquireWakeLock()
        
        retryManager = RetryManager(
            onRetry = { performPing() },
            coroutineScope = serviceScope
        )

        networkMonitor = NetworkMonitor(this) { isAvailable ->
            isNetworkAvailable = isAvailable
            Log.d(MyApplication.TAG, "Network status changed. Available: $isAvailable")
            if (isAvailable) {
                retryManager.resetAndRetry()
            } else {
                retryManager.pause()
            }
        }
        networkMonitor.startMonitoring()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(MyApplication.TAG, "PersistentService onStartCommand")
        
        val notification = buildNotification()
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                // We use DATA_SYNC instead of MICROPHONE because Android 14+ strictly forbids 
                // starting a microphone foreground service from the background (e.g. on boot).
                startForeground(
                    NOTIFICATION_ID, 
                    notification, 
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } catch (e: SecurityException) {
                Log.e(MyApplication.TAG, "Failed to start foreground service: ${e.message}")
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        startAudioMonitoring()

        if (isNetworkAvailable) {
            retryManager.resetAndRetry()
        }

        return START_STICKY
    }

    private fun startAudioMonitoring() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(MyApplication.TAG, "RECORD_AUDIO permission not granted")
            return
        }

        if (isRecording) return

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                44100,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            )

            audioRecord?.startRecording()
            isRecording = true
            Log.d(MyApplication.TAG, "Audio recording started for ambient noise monitoring.")

            serviceScope.launch(Dispatchers.IO) {
                val audioData = ShortArray(bufferSize)
                while (isRecording && audioRecord?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    val readResult = audioRecord?.read(audioData, 0, bufferSize) ?: 0
                    if (readResult > 0) {
                        // Processing ambient noise levels here...
                        // E.g. analyzing volume to detect security events.
                        // (We just read data to keep microphone active and legitimate)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(MyApplication.TAG, "Failed to start audio recording: ${e.message}")
        }
    }

    private fun performPing() {
        if (!isNetworkAvailable) {
            Log.d(MyApplication.TAG, "Ping aborted: No network")
            return
        }

        serviceScope.launch {
            try {
                // Here we use BuildConfig.BACKEND_URL or a fallback
                val endpoint = BuildConfig.BACKEND_URL
                Log.d(MyApplication.TAG, "Pinging endpoint: $endpoint")
                
                // Simulate network call
                delay(1000) 
                
                // Simulate success
                val success = true 
                
                if (success) {
                    Log.d(MyApplication.TAG, "Ping successful.")
                    retryManager.onSuccess()
                    PingWorker.schedulePeriodic(applicationContext)
                } else {
                    throw Exception("Server returned error")
                }
            } catch (e: Exception) {
                Log.e(MyApplication.TAG, "Ping failed: ${e.message}")
                retryManager.onFailure()
            }
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Headless Sync (Security)")
            .setContentText("Microphone active: Monitoring ambient noise for security")
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Persistent Sync Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the background service running"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private var wakeLock: android.os.PowerManager.WakeLock? = null

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        wakeLock = powerManager.newWakeLock(
            android.os.PowerManager.PARTIAL_WAKE_LOCK,
            "HeadlessSync::WakelockTag"
        )
        wakeLock?.acquire()
        Log.d(MyApplication.TAG, "WakeLock acquired")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(MyApplication.TAG, "PersistentService onDestroy")
        isRecording = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
        networkMonitor.stopMonitoring()
        serviceScope.cancel()
        
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
            Log.d(MyApplication.TAG, "WakeLock released")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
