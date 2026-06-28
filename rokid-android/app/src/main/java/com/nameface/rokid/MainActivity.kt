package com.nameface.rokid

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.http.SslError
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.nameface.rokid.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var pendingPermissionRequest: PermissionRequest? = null
    private var jsBridge: RokidJsBridge? = null
    private var serverReady = false
    private var waitingForWifi = false
    private var lastWifiSettingsLaunchMs = 0L

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingPermissionRequest
            pendingPermissionRequest = null
            when {
                granted && request != null -> runOnUiThread { request.grant(request.resources) }
                granted -> beginAppFlow()
                request != null -> runOnUiThread { request.deny() }
                else -> Toast.makeText(this, R.string.camera_permission_denied, Toast.LENGTH_LONG).show()
            }
        }

    private val settingsLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            beginAppFlow()
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        window.decorView.setBackgroundColor(Color.BLACK)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        enterImmersiveMode()

        configureWebView(binding.webView)
        clearWebViewCacheIfUpdated(binding.webView)
        binding.settingsFab.setOnClickListener { openSettings() }

        if (hasCameraPermission()) {
            beginAppFlow()
        } else {
            cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
        }
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        enterImmersiveMode()
        if (waitingForWifi) {
            if (NetworkHelper.isWifiConnected(this)) {
                waitingForWifi = false
                if (hasCameraPermission()) {
                    startWithDiscovery()
                }
            } else {
                showWifiWaitingUi()
                promptOpenWifiSettings(force = true)
            }
            return
        }
        ensureNativeRunning()
    }

    override fun onPause() {
        binding.webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        if (DeviceProfile.useNativeCamera() && isFinishing) {
            RecognizeStreamService.stop(this)
        }
        binding.webView.destroy()
        super.onDestroy()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (binding.webView.canGoBack()) {
                binding.webView.goBack()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun configureWebView(webView: WebView) {
        webView.setBackgroundColor(Color.BLACK)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        jsBridge = RokidJsBridge(webView).also { bridge ->
            RecognizeStreamService.jsBridge = bridge
            if (DeviceProfile.useNativeCamera()) {
                bridge.onPageReady = { ensureNativeRunning() }
            }
            webView.addJavascriptInterface(bridge, "NameFaceRokidNative")
        }

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            userAgentString = "$userAgentString NameFaceRokid/1.0"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                return !url.contains("/rokid") && !url.contains("/glasses")
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.proceed()
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: android.webkit.WebResourceError,
            ) {
                if (!request.isForMainFrame) return
                runOnUiThread {
                    Toast.makeText(this@MainActivity, R.string.page_load_failed, Toast.LENGTH_SHORT).show()
                    retryDiscovery()
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                binding.loadingOverlay.visibility = View.GONE
                val native = DeviceProfile.useNativeCamera()
                view.evaluateJavascript(
                    """
                    window.NameFaceRokid=window.NameFaceRokid||{};
                    window.NameFaceRokid.nativeCamera=$native;
                    if($native&&window.NameFaceRokidNative&&window.NameFaceRokidNative.onPageReady){
                      window.NameFaceRokidNative.onPageReady();
                    }
                    """.trimIndent(),
                    null,
                )
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val needsCamera = request.resources.any {
                    it == PermissionRequest.RESOURCE_VIDEO_CAPTURE ||
                        it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                }
                if (needsCamera) {
                    if (DeviceProfile.useNativeCamera()) {
                        runOnUiThread { request.deny() }
                        return
                    }
                    if (!hasCameraPermission()) {
                        pendingPermissionRequest = request
                        cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
                        return
                    }
                    runOnUiThread { request.grant(request.resources) }
                    return
                }
                runOnUiThread { request.grant(request.resources) }
            }
        }
    }

    private fun ensureNativeRunning() {
        if (!DeviceProfile.useNativeCamera() || !hasCameraPermission() || !serverReady) return
        RecognizeStreamService.jsBridge = jsBridge
        val backend = Prefs.getBackendHost(this)
        if (RecognizeStreamService.isRunning() && RecognizeStreamService.activeBackendHost == backend) {
            return
        }
        restartNativeRecognize()
    }

    private fun restartNativeRecognize() {
        if (!DeviceProfile.useNativeCamera() || !hasCameraPermission() || !serverReady) return
        RecognizeStreamService.jsBridge = jsBridge
        val backend = Prefs.getBackendHost(this)
        if (RecognizeStreamService.isRunning()) {
            if (RecognizeStreamService.activeBackendHost == backend) return
            RecognizeStreamService.stop(this)
        }
        RecognizeStreamService.start(this, backend)
    }

    private fun startNativeRecognize() {
        ensureNativeRunning()
    }

    private fun beginAppFlow() {
        if (!hasCameraPermission()) {
            cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
            return
        }
        if (!ensureWifiConnected()) return
        startWithDiscovery()
    }

    private fun ensureWifiConnected(): Boolean {
        if (NetworkHelper.isWifiConnected(this)) {
            waitingForWifi = false
            return true
        }
        waitingForWifi = true
        showWifiWaitingUi()
        Toast.makeText(this, R.string.wifi_connect_required, Toast.LENGTH_LONG).show()
        promptOpenWifiSettings(force = false)
        return false
    }

    private fun showWifiWaitingUi() {
        binding.loadingOverlay.visibility = View.VISIBLE
        binding.loadingMessage.visibility = View.VISIBLE
        binding.loadingMessage.setText(R.string.wifi_still_disconnected)
    }

    private fun promptOpenWifiSettings(force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - lastWifiSettingsLaunchMs < 1_500) return
        lastWifiSettingsLaunchMs = now
        try {
            startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
        } catch (_: Exception) {
            NetworkHelper.openWifiSettings(this)
        }
    }

    private fun startWithDiscovery() {
        binding.loadingOverlay.visibility = View.VISIBLE
        Thread {
            val cachedOk = ServerDiscovery.verifySaved(this)
            runOnUiThread {
                if (cachedOk) {
                    binding.loadingMessage.visibility = View.GONE
                    loadGlassesPage()
                } else {
                    runDiscovery()
                }
            }
        }.start()
    }

    private fun retryDiscovery() {
        if (!ensureWifiConnected()) return
        binding.loadingOverlay.visibility = View.VISIBLE
        runDiscovery()
    }

    private fun runDiscovery() {
        if (!NetworkHelper.isWifiConnected(this)) {
            ensureWifiConnected()
            return
        }
        binding.loadingMessage.visibility = View.VISIBLE
        ServerDiscovery.discover { result ->
            runOnUiThread {
                binding.loadingMessage.visibility = View.GONE
                if (result != null) {
                    Prefs.saveDiscovered(
                        this,
                        result.frontendHost,
                        result.backendHost,
                        result.useHttps,
                    )
                    Toast.makeText(
                        this,
                        getString(R.string.discover_success, result.backendHost),
                        Toast.LENGTH_SHORT,
                    ).show()
                } else {
                    Toast.makeText(this, R.string.discover_failed, Toast.LENGTH_LONG).show()
                }
                loadGlassesPage()
            }
        }
    }

    private fun loadGlassesPage() {
        serverReady = true
        binding.loadingOverlay.visibility = View.VISIBLE
        binding.webView.loadUrl(Prefs.buildGlassesUrl(this))
        ensureNativeRunning()
    }

    private fun clearWebViewCacheIfUpdated(webView: WebView) {
        val meta = getSharedPreferences("nameface_app_meta", MODE_PRIVATE)
        val lastVersion = meta.getInt("version_code", 0)
        if (lastVersion != BuildConfig.VERSION_CODE) {
            webView.clearCache(true)
            meta.edit().putInt("version_code", BuildConfig.VERSION_CODE).apply()
        }
    }

    private fun openSettings() {
        settingsLauncher.launch(Intent(this, SettingsActivity::class.java))
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
