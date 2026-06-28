package com.nameface.rokid

import android.content.Context
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import java.nio.ByteBuffer
import kotlin.math.abs

/** Camera2 采集：优先 ISP 直出 JPEG，否则 YUV + MediaCodecJpegEncoder。 */
class NativeCameraCapture(
    private val context: Context,
    private val maxWidth: Int = 480,
    private val jpegQuality: Int = 50,
    private val maxFps: Int = Prefs.MAX_STREAM_FPS,
    private val onJpeg: (ByteArray, Int, Int) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val tag = "NativeCamera"
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var dummySurface: Surface? = null
    private var running = false
    private var encoding = false
    private var frameWidth = 0
    private var frameHeight = 0
    @Volatile
    private var lastJpeg: ByteArray? = null
    private val minFrameIntervalNs: Long =
        1_000_000_000L / maxFps.coerceIn(1, 60)
    private var lastDeliveredAtNs = 0L

    fun getLatestJpeg(): ByteArray? = lastJpeg

    fun start() {
        if (running) return
        running = true
        thread = HandlerThread("NativeCamera").also { it.start() }
        handler = Handler(thread!!.looper)
        handler?.post { openCamera() }
    }

    fun stop() {
        running = false
        handler?.post {
            try {
                captureSession?.close()
                cameraDevice?.close()
                imageReader?.close()
                dummySurface?.release()
            } catch (_: Exception) {
            }
            captureSession = null
            cameraDevice = null
            imageReader = null
            dummySurface = null
        }
        thread?.quitSafely()
        thread = null
        handler = null
    }

    fun restart() {
        if (!running) return
        handler?.post {
            try {
                captureSession?.close()
                cameraDevice?.close()
                imageReader?.close()
                dummySurface?.release()
            } catch (_: Exception) {
            }
            captureSession = null
            cameraDevice = null
            imageReader = null
            dummySurface = null
            encoding = false
            openCamera()
        }
    }

    private fun openCamera() {
        try {
            val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = pickCameraId(manager) ?: run {
                onError("未找到可用摄像头")
                return
            }
            val map = manager.getCameraCharacteristics(cameraId)
                .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            val jpegSizes = map?.getOutputSizes(ImageFormat.JPEG)
            val yuvSizes = map?.getOutputSizes(ImageFormat.YUV_420_888)
            val size = chooseSize(jpegSizes) ?: chooseSize(yuvSizes) ?: run {
                onError("摄像头分辨率不可用")
                return
            }
            frameWidth = size.width
            frameHeight = size.height
            val useJpeg = jpegSizes?.any { it.width == size.width && it.height == size.height } == true
            val format = if (useJpeg) ImageFormat.JPEG else ImageFormat.YUV_420_888

            imageReader = ImageReader.newInstance(size.width, size.height, format, 3).apply {
                setOnImageAvailableListener({ reader ->
                    val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
                    if (!running) {
                        image.close()
                        return@setOnImageAvailableListener
                    }
                    if (encoding) {
                        image.close()
                        return@setOnImageAvailableListener
                    }
                    val now = System.nanoTime()
                    if (now - lastDeliveredAtNs < minFrameIntervalNs) {
                        image.close()
                        return@setOnImageAvailableListener
                    }
                    lastDeliveredAtNs = now
                    encoding = true
                    try {
                        deliverFrame(image)
                    } finally {
                        image.close()
                        encoding = false
                    }
                }, handler)
            }

            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    createSession(camera)
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    cameraDevice = null
                    captureSession = null
                    if (running) handler?.postDelayed({ openCamera() }, 500)
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    cameraDevice = null
                    captureSession = null
                    if (running) {
                        onError("摄像头打开失败 ($error)")
                        handler?.postDelayed({ openCamera() }, 1_000)
                    }
                }
            }, handler)
        } catch (e: SecurityException) {
            onError("无摄像头权限")
        } catch (e: Exception) {
            Log.e(tag, "openCamera", e)
            onError(e.message ?: "摄像头初始化失败")
        }
    }

    private fun createSession(camera: CameraDevice) {
        val reader = imageReader ?: return
        val texture = SurfaceTexture(0)
        dummySurface = Surface(texture)
        camera.createCaptureSession(
            listOf(reader.surface, dummySurface!!),
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    val builder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                        addTarget(reader.surface)
                        set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                    }
                    session.setRepeatingRequest(builder.build(), null, handler)
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    onError("摄像头会话配置失败")
                }
            },
            handler,
        )
    }

    private fun deliverFrame(image: Image) {
        val jpeg = if (image.format == ImageFormat.JPEG) {
            image.planes[0].buffer.toByteArray()
        } else {
            MediaCodecJpegEncoder.encodeYuv420(image, jpegQuality)
        } ?: return
        lastJpeg = jpeg
        onJpeg(jpeg, frameWidth, frameHeight)
    }

    private fun pickCameraId(manager: CameraManager): String? {
        for (id in manager.cameraIdList) {
            val facing = manager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.LENS_FACING)
            if (facing == CameraCharacteristics.LENS_FACING_BACK ||
                facing == CameraCharacteristics.LENS_FACING_EXTERNAL
            ) {
                return id
            }
        }
        return manager.cameraIdList.firstOrNull()
    }

    private fun chooseSize(sizes: Array<Size>?): Size? {
        if (sizes.isNullOrEmpty()) return null
        val sorted = sizes.sortedByDescending { it.width * it.height }
        val underMax = sorted.filter { it.width <= maxWidth }
        if (underMax.isNotEmpty()) return underMax.minByOrNull { abs(it.width - maxWidth) }
        return sorted.minByOrNull { it.width }
    }

    private fun ByteBuffer.toByteArray(): ByteArray {
        rewind()
        val bytes = ByteArray(remaining())
        get(bytes)
        return bytes
    }
}
