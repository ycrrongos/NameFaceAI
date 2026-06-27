package com.nameface.rokid

import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

class RokidJsBridge(private val webView: WebView) {
    @Volatile
    var onPageReady: (() -> Unit)? = null

    @JavascriptInterface
    fun isNativeCamera(): Boolean = DeviceProfile.useNativeCamera()

    @JavascriptInterface
    fun onPageReady() {
        webView.post { onPageReady?.invoke() }
    }

    fun pushRecognizeResult(json: JSONObject) {
        val b64 = Base64.encodeToString(json.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        val script =
            "window.NameFaceRokid&&window.NameFaceRokid.onRecognizeResult&&" +
                "window.NameFaceRokid.onRecognizeResult(JSON.parse(atob('$b64')));"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    fun pushConnection(connected: Boolean) {
        val script =
            "window.NameFaceRokid&&window.NameFaceRokid.onConnectionChange&&" +
                "window.NameFaceRokid.onConnectionChange($connected);"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    fun pushFrameSize(width: Int, height: Int) {
        val script =
            "window.NameFaceRokid&&window.NameFaceRokid.onFrameSize&&" +
                "window.NameFaceRokid.onFrameSize($width,$height);"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    fun pushError(message: String) {
        val safe = message.replace("\\", "\\\\").replace("'", "\\'")
        val script =
            "window.NameFaceRokid&&window.NameFaceRokid.onError&&" +
                "window.NameFaceRokid.onError('$safe');"
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
