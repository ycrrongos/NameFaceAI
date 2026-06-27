package com.nameface.rokid

import android.os.Build

object DeviceProfile {
    /** Rokid 眼镜硬件；普通手机走 WebView 摄像头 + WebSocket */
    fun isRokidGlasses(): Boolean {
        val model = Build.MODEL.orEmpty().lowercase()
        val product = Build.PRODUCT.orEmpty().lowercase()
        val device = Build.DEVICE.orEmpty().lowercase()
        val manufacturer = Build.MANUFACTURER.orEmpty().lowercase()
        return model.contains("glasses") ||
            product.contains("glasses") ||
            device.contains("glasses") ||
            model.startsWith("rg_") ||
            manufacturer.contains("rokid")
    }

    fun useNativeCamera(): Boolean = isRokidGlasses()
}
