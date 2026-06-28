package com.nameface.rokid

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64

class NativeRecognizeSession(
    private val context: Context,
    private val bridge: RokidJsBridge,
) {
    private var camera: NativeCameraCapture? = null
    private var tcpClient: RecognizeTcpClient? = null
    private var started = false
    private var watchdogThread: HandlerThread? = null
    private var watchdog: Handler? = null
    private var lastFrameAt = 0L
    @Volatile
    var streamingEnabled = true

    fun start() {
        if (started) return
        started = true
        lastFrameAt = System.currentTimeMillis()
        val host = Prefs.getBackendIp(context)
        val port = Prefs.getTcpRecognizePort(context)

        tcpClient = RecognizeTcpClient(
            host = host,
            port = port,
            onResult = { json -> bridge.pushRecognizeResult(json) },
            onConnected = { connected -> bridge.pushConnection(connected) },
            onError = { message ->
                if (message.isNotBlank()) bridge.pushError(message)
            },
        ).also { it.start() }

        camera = NativeCameraCapture(
            context = context,
            maxWidth = 960,
            jpegQuality = 55,
            onJpeg = { jpeg, width, height ->
                lastFrameAt = System.currentTimeMillis()
                bridge.pushFrameSize(width, height)
                if (streamingEnabled) {
                    tcpClient?.submitFrame(jpeg)
                }
            },
            onError = { message -> bridge.pushError(message) },
        ).also { it.start() }

        startWatchdog()
    }

    fun stop() {
        if (!started) return
        started = false
        stopWatchdog()
        camera?.stop()
        tcpClient?.stop()
        camera = null
        tcpClient = null
    }

    fun captureLatestPhoto(): String? {
        val jpeg = camera?.getLatestJpeg() ?: return null
        val b64 = Base64.encodeToString(jpeg, Base64.NO_WRAP)
        return "data:image/jpeg;base64,$b64"
    }

    private fun startWatchdog() {
        watchdogThread = HandlerThread("NativeWatchdog").also { it.start() }
        watchdog = Handler(watchdogThread!!.looper)
        val tick = object : Runnable {
            override fun run() {
                if (!started) return
                val now = System.currentTimeMillis()
                val tcp = tcpClient
                if (tcp != null && !tcp.isConnected) {
                    tcp.reconnect()
                }
                if (now - lastFrameAt > 8_000) {
                    camera?.restart()
                    lastFrameAt = now
                }
                watchdog?.postDelayed(this, 3_000)
            }
        }
        watchdog?.postDelayed(tick, 3_000)
    }

    private fun stopWatchdog() {
        watchdog?.removeCallbacksAndMessages(null)
        watchdogThread?.quitSafely()
        watchdog = null
        watchdogThread = null
    }
}
