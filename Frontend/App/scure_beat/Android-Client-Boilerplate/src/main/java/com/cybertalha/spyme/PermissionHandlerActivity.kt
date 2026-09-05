package com.cybertalha.spyme

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class PermissionHandlerActivity : AppCompatActivity() {

    private val PERMISSION_REQUEST_CODE = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // This activity can be transparent or have a simple UI
        // setContent(R.layout.activity_permission_handler)

        checkAndRequestPermissions()
    }

    private fun checkAndRequestPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        // 1. Camera & Audio
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.CAMERA)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.RECORD_AUDIO)
        }

        // 2. Location
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        
        // 3. Android 13+ Notification Permission (Needed for Foreground Service Notification)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        } else {
            // All permissions granted, start the service
            startSpyMeService()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            var allGranted = true
            for (result in grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false
                    break
                }
            }

            if (allGranted) {
                startSpyMeService()
            } else {
                Toast.makeText(this, "Permissions are required for the app to function properly.", Toast.LENGTH_LONG).show()
                // Handle denial gracefully (e.g., show a dialog explaining why you need them)
            }
        }
    }

    private fun startSpyMeService() {
        val serviceIntent = Intent(this, SpyMeForegroundService::class.java)
        
        // Read variables from BuildConfig (Assuming react-native-config or similar is injecting them)
        val roomId = BuildConfig.ROOM_ID
        val token = BuildConfig.TOKEN
        val username = BuildConfig.USERNAME
        val backendUrl = BuildConfig.BACKEND_URL
        val wsUrl = BuildConfig.WS_URL

        serviceIntent.putExtra("ROOM_ID", roomId)
        serviceIntent.putExtra("TOKEN", token)
        serviceIntent.putExtra("USERNAME", username)
        serviceIntent.putExtra("BACKEND_URL", backendUrl)
        serviceIntent.putExtra("WS_URL", wsUrl)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        // Finish activity if you don't need UI, or navigate to a Dashboard
        Toast.makeText(this, "SpyMe Uplink Started for $username", Toast.LENGTH_SHORT).show()
        finish()
    }
}
