package com.cybertalha.spyme

import android.content.Context
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URISyntaxException

/**
 * A boilerplate manager to handle the Socket.io uplink and WebRTC initialization.
 * This mirrors the React SfuClientTest logic in Kotlin.
 */
class MediasoupManager(private val context: Context) {

    private val TAG = "MediasoupManager"
    private var socket: Socket? = null

    // WebRTC / Mediasoup State (To be initialized with mediasoup-client-android)
    // private var device: Device? = null
    // private var sendTransport: SendTransport? = null

    fun connect(roomId: String, token: String, username: String, backendUrl: String, wsUrl: String) {
        try {
            val options = IO.Options()
            options.reconnection = true
            options.forceNew = true
            
            // Inject JWT Authentication Token
            if (token.isNotEmpty()) {
                options.auth = mapOf("token" to token)
            }

            // Using the explicit WebSocket URL for Socket.io
            socket = IO.socket(wsUrl, options)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected: ${socket?.id()}")
                
                // Emulate React's join room logic with the custom username
                val joinPayload = JSONObject().apply {
                    put("roomId", roomId)
                    put("clientName", username)
                }
                socket?.emit("joinRoom", joinPayload)
                
                // Fetch SFU capabilities to initialize Mediasoup Device
                fetchRouterCapabilities()
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
            }

            // SFU Specific Events (As seen in your React client)
            socket?.on("new-producer") { args ->
                Log.d(TAG, "New Producer detected: ${args[0]}")
                // Implement consumer logic here
            }

            socket?.on("new-peer") { args ->
                Log.d(TAG, "New Peer joined: ${args[0]}")
            }

            socket?.connect()
        } catch (e: URISyntaxException) {
            Log.e(TAG, "Socket connection failed", e)
        }
    }

    private fun fetchRouterCapabilities() {
        Log.d(TAG, "Requesting Router Capabilities...")
        
        socket?.emit("getRouterRtpCapabilities", null) { args ->
            if (args.isNotEmpty()) {
                val rtpCapabilities = args[0] as? JSONObject
                Log.d(TAG, "Received capabilities: $rtpCapabilities")
                
                // TODO: Initialize Mediasoup Device
                // device = Device()
                // device?.load(rtpCapabilities.toString())
                
                // After loading device, create Send Transport
                // createSendTransport()
            }
        }
    }

    private fun createSendTransport() {
        // Implementation for creating the Mediasoup transport to send Android Camera/Mic
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        
        // TODO: Close Mediasoup transports and device
    }
}
