package com.nameface.rokid

import android.content.Context
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

object ServerDiscovery {

    private const val BACKEND_PORT = 8000
    private const val FRONTEND_PORT_HTTPS = 5173
    private const val FRONTEND_PORT_HTTP = 5174
    private const val CONNECT_TIMEOUT_MS = 1200
    private const val READ_TIMEOUT_MS = 1200

    data class Result(
        val frontendHost: String,
        val backendHost: String,
        val useHttps: Boolean,
    )

    fun discover(onComplete: (Result?) -> Unit) {
        Thread {
            onComplete(runDiscovery())
        }.start()
    }

    fun verifySaved(context: Context): Boolean {
        val backendIp = Prefs.getBackendIp(context)
        if (!probeBackend(backendIp)) return false
        return probeFrontendHost(Prefs.getFrontendHost(context), Prefs.useHttps(context))
    }

    private fun runDiscovery(): Result? {
        val subnets = getLocalSubnets()
        if (subnets.isEmpty()) return null

        for ((prefix, localIp) in subnets) {
            val backendIp = findBackendIp(prefix, localIp) ?: continue
            val frontend = findFrontend(prefix, backendIp) ?: continue
            return Result(
                frontendHost = "${frontend.first}:${frontend.second}",
                backendHost = "$backendIp:$BACKEND_PORT",
                useHttps = frontend.third,
            )
        }
        return null
    }

    private fun findBackendIp(prefix: String, localIp: String): String? {
        val found = AtomicReference<String?>(null)
        val executor = Executors.newFixedThreadPool(48)
        for (ip in buildIpCandidates(prefix, localIp)) {
            executor.submit {
                if (found.get() != null) return@submit
                if (probeBackend(ip)) found.compareAndSet(null, ip)
            }
        }
        executor.shutdown()
        executor.awaitTermination(25, TimeUnit.SECONDS)
        return found.get()
    }

    private fun findFrontend(prefix: String, preferredIp: String): Triple<String, Int, Boolean>? {
        probeFrontendOnIp(preferredIp)?.let { (port, useHttps) ->
            return Triple(preferredIp, port, useHttps)
        }

        val found = AtomicReference<Triple<String, Int, Boolean>?>(null)
        val executor = Executors.newFixedThreadPool(48)
        for (ip in buildIpCandidates(prefix, preferredIp)) {
            if (ip == preferredIp) continue
            executor.submit {
                if (found.get() != null) return@submit
                probeFrontendOnIp(ip)?.let { (port, useHttps) ->
                    found.compareAndSet(null, Triple(ip, port, useHttps))
                }
            }
        }
        executor.shutdown()
        executor.awaitTermination(25, TimeUnit.SECONDS)
        return found.get()
    }

    /** 优先 HTTPS 5173：WebView 仅在安全上下文中提供摄像头 */
    private fun probeFrontendOnIp(ip: String): Pair<Int, Boolean>? {
        if (probeFrontendUrl("https://$ip:$FRONTEND_PORT_HTTPS/rokid", https = true)) {
            return FRONTEND_PORT_HTTPS to true
        }
        if (probeFrontendUrl("http://$ip:$FRONTEND_PORT_HTTP/rokid", https = false)) {
            return FRONTEND_PORT_HTTP to false
        }
        if (probeFrontendUrl("http://$ip:$FRONTEND_PORT_HTTPS/rokid", https = false)) {
            return FRONTEND_PORT_HTTPS to false
        }
        return null
    }

    private fun probeFrontendHost(host: String, useHttps: Boolean): Boolean {
        val ip = host.substringBefore(':')
        val port = host.substringAfter(':', FRONTEND_PORT_HTTPS.toString()).toIntOrNull()
            ?: FRONTEND_PORT_HTTPS
        if (useHttps) {
            return probeFrontendUrl("https://$ip:$port/rokid", https = true)
        }
        return probeFrontendUrl("http://$ip:$port/rokid", https = false) ||
            probeFrontendUrl("http://$ip:$FRONTEND_PORT_HTTP/rokid", https = false)
    }

    private fun buildIpCandidates(prefix: String, priorityIp: String): List<String> {
        val ordered = mutableListOf<String>()
        if (priorityIp.isNotBlank()) ordered.add(priorityIp)
        for (last in listOf(1, 100, 159, 2, 10, 20, 50, 101, 103, 156) + (1..254).toList()) {
            val ip = "$prefix.$last"
            if (ip != priorityIp) ordered.add(ip)
        }
        return ordered
    }

    private fun getLocalSubnets(): List<Pair<String, String>> {
        val result = mutableListOf<Pair<String, String>>()
        val seen = mutableSetOf<String>()
        val interfaces = NetworkInterface.getNetworkInterfaces() ?: return emptyList()
        for (intf in interfaces) {
            if (!intf.isUp || intf.isLoopback) continue
            for (addr in intf.inetAddresses) {
                if (addr.isLoopbackAddress || addr !is Inet4Address) continue
                val host = addr.hostAddress ?: continue
                if (host.startsWith("169.254.")) continue
                val prefix = host.substringBeforeLast('.')
                if (seen.add(prefix)) {
                    result.add(prefix to host)
                }
            }
        }
        return result
    }

    private fun probeBackend(ip: String): Boolean {
        return try {
            val conn = openHttp("http://$ip:$BACKEND_PORT/api/health")
            conn.requestMethod = "GET"
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return false
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            body.contains("\"status\"") &&
                (body.contains("model_loaded") || body.contains("\"ok\""))
        } catch (_: Exception) {
            false
        }
    }

    private fun probeFrontendUrl(urlString: String, https: Boolean): Boolean {
        return try {
            val conn = if (https) openHttps(urlString) else openHttp(urlString)
            conn.requestMethod = "GET"
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return false
            val body = conn.inputStream.bufferedReader().use { it.readText().take(4096) }
            body.contains("rokid", ignoreCase = true) ||
                body.contains("NameFace", ignoreCase = true) ||
                body.contains("<!doctype html", ignoreCase = true)
        } catch (_: Exception) {
            false
        }
    }

    private fun openHttp(urlString: String): HttpURLConnection {
        val conn = URL(urlString).openConnection() as HttpURLConnection
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.instanceFollowRedirects = true
        return conn
    }

    private fun openHttps(urlString: String): HttpsURLConnection {
        val conn = URL(urlString).openConnection() as HttpsURLConnection
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.instanceFollowRedirects = true
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, trustAllManagers, SecureRandom())
        conn.sslSocketFactory = sslContext.socketFactory
        conn.hostnameVerifier = HostnameVerifier { _, _ -> true }
        return conn
    }

    private val trustAllManagers = arrayOf<TrustManager>(
        object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        },
    )
}
