package com.anonymous.scure_beat

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat

class ResourceManagerService : Service() {

    private val CHANNEL_ID = "ResourceManagerChannel"
    private val NOTIFICATION_ID = 2

    private var cameraManager: CameraManager? = null
    private var cameraDevice: CameraDevice? = null
    private var audioRecorder: AudioRecord? = null
    
    private var cameraActive = false
    private var audioActive = false
    private var currentCameraId: String? = null
    
    private val prefs: SharedPreferences by lazy { 
        getSharedPreferences("resource_prefs", MODE_PRIVATE) 
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        
        // Restore state if needed
        cameraActive = prefs.getBoolean("camera", false)
        audioActive = prefs.getBoolean("audio", false)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundService("Service Started")
        
        intent?.getStringExtra("command")?.let { handleCommand(it) }
        return START_STICKY
    }
    
    private fun startForegroundService(statusText: String) {
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Resource Manager")
            .setContentText(statusText)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun handleCommand(command: String) {
        Log.d("ResourceManager", "Received command: $command")
        when {
            command.startsWith("camera_") -> handleCamera(command.removePrefix("camera_"))
            command.startsWith("audio_") -> handleAudio(command.removePrefix("audio_"))
        }
    }

    private fun handleCamera(action: String) {
        when (action) {
            "release" -> releaseCamera()
            "acquire" -> acquireCamera(null)
            "front" -> acquireCamera(getFrontCameraId())
            "back" -> acquireCamera(getBackCameraId())
            "toggle" -> if (cameraActive) releaseCamera() else acquireCamera(null)
        }
    }

    private fun acquireCamera(targetCameraId: String?) {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            Log.e("ResourceManager", "Camera permission not granted")
            return
        }
        
        try {
            val idToOpen = targetCameraId ?: currentCameraId ?: getBackCameraId() ?: return
            
            // If another camera is already open, release it first
            if (cameraDevice != null && currentCameraId != idToOpen) {
                releaseCamera()
            }
            
            cameraManager?.openCamera(idToOpen, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    currentCameraId = idToOpen
                    cameraActive = true
                    saveState("camera", true)
                    updateNotification("Camera: Active, Audio: ${if (audioActive) "Active" else "Released"}")
                }

                override fun onDisconnected(camera: CameraDevice) {
                    releaseCamera()
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    releaseCamera()
                }
            }, null)
        } catch (e: Exception) {
            Log.e("ResourceManager", "Error opening camera", e)
        }
    }

    private fun releaseCamera() {
        cameraDevice?.close()
        cameraDevice = null
        cameraActive = false
        saveState("camera", false)
        updateNotification("Camera: Released, Audio: ${if (audioActive) "Active" else "Released"}")
    }

    private fun getBackCameraId(): String? {
        return cameraManager?.cameraIdList?.firstOrNull { id ->
            cameraManager?.getCameraCharacteristics(id)?.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING) == 
                android.hardware.camera2.CameraCharacteristics.LENS_FACING_BACK
        }
    }
    
    private fun getFrontCameraId(): String? {
        return cameraManager?.cameraIdList?.firstOrNull { id ->
            cameraManager?.getCameraCharacteristics(id)?.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING) == 
                android.hardware.camera2.CameraCharacteristics.LENS_FACING_FRONT
        }
    }

    private fun handleAudio(action: String) {
        when (action) {
            "release" -> releaseAudio()
            "acquire" -> acquireAudio()
            "toggle" -> if (audioActive) releaseAudio() else acquireAudio()
        }
    }

    private fun acquireAudio() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e("ResourceManager", "Audio permission not granted")
            return
        }

        try {
            if (audioRecorder != null) releaseAudio()
            
            val sampleRate = 44100
            val channelConfig = AudioFormat.CHANNEL_IN_MONO
            val audioFormat = AudioFormat.ENCODING_PCM_16BIT
            val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)

            audioRecorder = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )

            if (audioRecorder?.state == AudioRecord.STATE_INITIALIZED) {
                audioRecorder?.startRecording()
                audioActive = true
                saveState("audio", true)
                updateNotification("Camera: ${if (cameraActive) "Active" else "Released"}, Audio: Active")
            }
        } catch (e: Exception) {
            Log.e("ResourceManager", "Error initializing audio record", e)
        }
    }

    private fun releaseAudio() {
        try {
            audioRecorder?.stop()
        } catch (e: Exception) {}
        audioRecorder?.release()
        audioRecorder = null
        audioActive = false
        saveState("audio", false)
        updateNotification("Camera: ${if (cameraActive) "Active" else "Released"}, Audio: Released")
    }

    private fun saveState(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }

    private fun updateNotification(text: String) {
        startForegroundService(text)
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseCamera()
        releaseAudio()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Resource Manager Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }
}
