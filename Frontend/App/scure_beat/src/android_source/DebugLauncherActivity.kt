package com.anonymous.scure_beat

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

class DebugLauncherActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d("DebugLauncher", "🚀 Debug launcher started")

        // Forward to PermissionHandlerActivity
        val intent = Intent(this, PermissionHandlerActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        startActivity(intent)
        finish()
    }
}
