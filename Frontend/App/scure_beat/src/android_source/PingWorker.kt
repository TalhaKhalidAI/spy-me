package com.anonymous.scure_beat

import android.content.Context
import android.util.Log
import androidx.work.*
import java.util.concurrent.TimeUnit

class PingWorker(
    appContext: Context, 
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        Log.d(MyApplication.TAG, "PingWorker executing...")
        
        val serviceIntent = android.content.Intent(applicationContext, PersistentService::class.java)
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(serviceIntent)
            } else {
                applicationContext.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(MyApplication.TAG, "Worker failed to restart service: ${e.message}")
        }
        
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "PeriodicPingWork"

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<PingWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
            Log.d(MyApplication.TAG, "Periodic PingWorker scheduled")
        }
    }
}
