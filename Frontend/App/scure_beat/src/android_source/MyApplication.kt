package com.anonymous.scure_beat

import android.app.Application
import android.util.Log
import androidx.work.Configuration

class MyApplication : Application(), Configuration.Provider {
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Application created")
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(Log.INFO)
            .build()

    companion object {
        const val TAG = "PersistentService"
    }
}
