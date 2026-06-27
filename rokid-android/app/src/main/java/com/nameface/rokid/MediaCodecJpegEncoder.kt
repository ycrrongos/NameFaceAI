package com.nameface.rokid

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.util.Log
import java.io.ByteArrayOutputStream

/** YUV → JPEG：优先 MediaCodec 硬件编码，失败则回退 YuvImage。 */
object MediaCodecJpegEncoder {
    private const val TAG = "MediaCodecJpeg"

    fun encodeYuv420(image: Image, quality: Int): ByteArray? {
        val nv21 = yuv420ToNv21(image) ?: return null
        return encodeNv21(nv21, image.width, image.height, quality)
    }

    fun encodeNv21(nv21: ByteArray, width: Int, height: Int, quality: Int): ByteArray? {
        encodeWithMediaCodec(nv21, width, height)?.let { return it }
        return try {
            val yuv = YuvImage(nv21, ImageFormat.NV21, width, height, null)
            val out = ByteArrayOutputStream()
            yuv.compressToJpeg(Rect(0, 0, width, height), quality.coerceIn(40, 95), out)
            out.toByteArray()
        } catch (e: Exception) {
            Log.w(TAG, "YuvImage fallback failed", e)
            null
        }
    }

    private fun encodeWithMediaCodec(nv21: ByteArray, width: Int, height: Int): ByteArray? {
        val codecName = findJpegEncoder() ?: return null
        var codec: MediaCodec? = null
        return try {
            codec = MediaCodec.createByCodecName(codecName)
            val format = MediaFormat.createVideoFormat("video/mjpeg", width, height)
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
            format.setInteger(MediaFormat.KEY_BIT_RATE, 2_000_000)
            format.setInteger(MediaFormat.KEY_FRAME_RATE, 15)
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 0)
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()

            val inputIndex = codec.dequeueInputBuffer(20_000)
            if (inputIndex < 0) return null
            codec.getInputBuffer(inputIndex)?.let { buffer ->
                buffer.clear()
                buffer.put(nv21)
                codec.queueInputBuffer(inputIndex, 0, nv21.size, 0, 0)
            }

            val info = MediaCodec.BufferInfo()
            val outputIndex = codec.dequeueOutputBuffer(info, 20_000)
            if (outputIndex < 0) return null
            val output = codec.getOutputBuffer(outputIndex) ?: return null
            val jpeg = ByteArray(info.size)
            output.get(jpeg)
            codec.releaseOutputBuffer(outputIndex, false)
            jpeg
        } catch (e: Exception) {
            Log.d(TAG, "MediaCodec MJPEG not available: ${e.message}")
            null
        } finally {
            try {
                codec?.stop()
                codec?.release()
            } catch (_: Exception) {
            }
        }
    }

    private fun findJpegEncoder(): String? {
        val infos = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
        for (info in infos) {
            if (!info.isEncoder) continue
            for (mime in info.supportedTypes) {
                if (mime.equals("video/mjpeg", ignoreCase = true)) return info.name
            }
        }
        return null
    }

    private fun yuv420ToNv21(image: Image): ByteArray? {
        if (image.format != ImageFormat.YUV_420_888) return null
        val width = image.width
        val height = image.height
        val ySize = width * height
        val nv21 = ByteArray(ySize + width * height / 2)
        val planes = image.planes
        val yBuffer = planes[0].buffer
        val uBuffer = planes[1].buffer
        val vBuffer = planes[2].buffer
        val yRowStride = planes[0].rowStride
        val yPixelStride = planes[0].pixelStride
        var pos = 0
        for (row in 0 until height) {
            var col = 0
            while (col < width) {
                nv21[pos++] = yBuffer.get(row * yRowStride + col * yPixelStride)
                col++
            }
        }
        val chromaHeight = height / 2
        val chromaWidth = width / 2
        val vRowStride = planes[2].rowStride
        val vPixelStride = planes[2].pixelStride
        val uRowStride = planes[1].rowStride
        val uPixelStride = planes[1].pixelStride
        pos = ySize
        for (row in 0 until chromaHeight) {
            for (col in 0 until chromaWidth) {
                nv21[pos++] = vBuffer.get(row * vRowStride + col * vPixelStride)
                nv21[pos++] = uBuffer.get(row * uRowStride + col * uPixelStride)
            }
        }
        return nv21
    }
}
