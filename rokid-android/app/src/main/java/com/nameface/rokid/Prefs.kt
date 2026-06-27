package com.nameface.rokid

import android.content.Context
import com.nameface.rokid.BuildConfig
import java.net.URLEncoder

object Prefs {
    private const val FILE = "nameface_rokid"
    private const val KEY_FRONTEND = "frontend_host"
    private const val KEY_BACKEND = "backend_host"
    private const val KEY_HTTPS = "use_https"
    private const val KEY_INSECURE_SSL = "allow_insecure_ssl"

    private const val DEFAULT_FRONTEND = "192.168.1.10:5173"
    private const val DEFAULT_BACKEND = "192.168.1.10:8000"
    const val DEFAULT_TCP_RECOGNIZE_PORT = 8001

    fun getFrontendHost(context: Context): String {
        return prefs(context).getString(KEY_FRONTEND, DEFAULT_FRONTEND) ?: DEFAULT_FRONTEND
    }

    fun getBackendHost(context: Context): String {
        return prefs(context).getString(KEY_BACKEND, DEFAULT_BACKEND) ?: DEFAULT_BACKEND
    }

    fun useHttps(context: Context): Boolean {
        return prefs(context).getBoolean(KEY_HTTPS, true)
    }

    fun allowInsecureSsl(context: Context): Boolean {
        return prefs(context).getBoolean(KEY_INSECURE_SSL, true)
    }

    fun isUsingDefaults(context: Context): Boolean {
        return getFrontendHost(context) == DEFAULT_FRONTEND &&
            getBackendHost(context) == DEFAULT_BACKEND
    }

    fun saveDiscovered(
        context: Context,
        frontendHost: String,
        backendHost: String,
        useHttps: Boolean,
    ) {
        save(
            context = context,
            frontendHost = frontendHost,
            backendHost = backendHost,
            useHttps = useHttps,
            allowInsecureSsl = true,
        )
    }

    fun save(
        context: Context,
        frontendHost: String,
        backendHost: String,
        useHttps: Boolean,
        allowInsecureSsl: Boolean,
    ) {
        prefs(context).edit()
            .putString(KEY_FRONTEND, sanitizeHost(frontendHost))
            .putString(KEY_BACKEND, sanitizeHost(backendHost))
            .putBoolean(KEY_HTTPS, useHttps)
            .putBoolean(KEY_INSECURE_SSL, allowInsecureSsl)
            .apply()
    }

    fun getBackendIp(context: Context): String =
        getBackendHost(context).substringBefore(':')

    fun getTcpRecognizePort(context: Context): Int = DEFAULT_TCP_RECOGNIZE_PORT

    fun buildGlassesUrl(context: Context): String {
        val scheme = if (useHttps(context)) "https" else "http"
        val frontend = getFrontendHost(context)
        val backend = getBackendHost(context)
        val wsUrl = "ws://$backend/ws/recognize"
        val wsParam = URLEncoder.encode(wsUrl, "UTF-8")
        val nativeFlag = if (DeviceProfile.useNativeCamera()) "&native=1" else ""
        return "$scheme://$frontend/rokid?backend=$backend&ws=$wsParam$nativeFlag&v=${BuildConfig.VERSION_CODE}"
    }

    fun getFrontendIp(context: Context): String =
        getFrontendHost(context).substringBefore(':')

    private fun sanitizeHost(value: String): String {
        return value
            .trim()
            .removePrefix("http://")
            .removePrefix("https://")
            .trimEnd('/')
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
