package com.anonymous.scure_beat

import android.util.Log
import kotlinx.coroutines.*

class RetryManager(
    private val onRetry: () -> Unit,
    private val coroutineScope: CoroutineScope
) {
    private var retryJob: Job? = null
    private var attempt = 0
    private var isPaused = false

    private val INITIAL_DELAY = 1000L // 1 second
    private val MAX_DELAY = 60000L // 60 seconds

    fun onSuccess() {
        attempt = 0
        retryJob?.cancel()
    }

    fun onFailure() {
        if (isPaused) return
        attempt++
        scheduleRetry()
    }

    fun resetAndRetry() {
        isPaused = false
        attempt = 0
        retryJob?.cancel()
        onRetry()
    }

    fun pause() {
        isPaused = true
        retryJob?.cancel()
    }

    private fun scheduleRetry() {
        retryJob?.cancel()
        
        val backoffMultiplier = 1 shl (attempt - 1).coerceAtMost(30)
        var delayTime = INITIAL_DELAY * backoffMultiplier
        
        if (delayTime > MAX_DELAY || delayTime <= 0) {
            delayTime = MAX_DELAY
        }

        Log.d(MyApplication.TAG, "Scheduling retry attempt $attempt in ${delayTime}ms")

        retryJob = coroutineScope.launch {
            delay(delayTime)
            if (!isPaused) {
                onRetry()
            }
        }
    }
}
