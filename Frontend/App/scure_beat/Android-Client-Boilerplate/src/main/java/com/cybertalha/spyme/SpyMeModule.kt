package com.cybertalha.spyme

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SpyMeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SpyMeNativeModule"
    }

    @ReactMethod
    fun startService() {
        val intent = Intent(reactContext, PermissionHandlerActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        reactContext.startActivity(intent)
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactContext, SpyMeForegroundService::class.java)
        reactContext.stopService(intent)
    }
}
