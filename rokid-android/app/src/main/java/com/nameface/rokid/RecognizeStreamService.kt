package com.nameface.rokid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** 前台服务：息屏/切后台时仍保持摄像头 + TCP 推流。 */
class RecognizeStreamService : Service() {

    private var session: NativeRecognizeSession? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopStreaming()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                val backend = intent?.getStringExtra(EXTRA_BACKEND_HOST) ?: Prefs.getBackendHost(this)
                if (session != null && activeBackendHost == backend) {
                    return START_STICKY
                }
                stopStreaming()
                activeBackendHost = backend
                startStreaming()
                return START_STICKY
            }
        }
    }

    override fun onDestroy() {
        stopStreaming()
        running = false
        if (instance === this) instance = null
        super.onDestroy()
    }

    private fun startStreaming() {
        if (session != null) return
        val bridge = jsBridge
        if (bridge == null) {
            stopSelf()
            return
        }
        running = true
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA,
            )
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, notification)
        }
        session = NativeRecognizeSession(applicationContext, bridge).also { it.start() }
    }

    private fun stopStreaming() {
        session?.stop()
        session = null
        activeBackendHost = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun buildNotification(): Notification {
        createChannel()
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.stream_notification_title))
            .setContentText(getString(R.string.stream_notification_text))
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentIntent(open)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.stream_notification_channel),
            NotificationManager.IMPORTANCE_LOW,
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager?.createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "nameface_stream"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_STOP = "com.nameface.rokid.STOP_STREAM"
        private const val EXTRA_BACKEND_HOST = "backend_host"

        @Volatile
        private var instance: RecognizeStreamService? = null

        @Volatile
        var jsBridge: RokidJsBridge? = null

        @Volatile
        private var running = false

        @Volatile
        var activeBackendHost: String? = null

        fun isRunning(): Boolean = running && instance?.session != null

        fun start(context: Context, backendHost: String) {
            val intent = Intent(context, RecognizeStreamService::class.java)
                .putExtra(EXTRA_BACKEND_HOST, backendHost)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            running = false
            instance?.stopStreaming()
            context.stopService(Intent(context, RecognizeStreamService::class.java))
            activeBackendHost = null
        }
    }
}
