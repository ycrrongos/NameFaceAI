package com.nameface.rokid

import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicReference

/** TCP 识别：uint32_be 长度前缀 JPEG 上行，JSON 下行；发送侧只保留最新帧。 */
class RecognizeTcpClient(
    private val host: String,
    private val port: Int,
    private val onResult: (JSONObject) -> Unit,
    private val onConnected: (Boolean) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val tag = "RecognizeTcp"
    private var socket: Socket? = null
    private var output: BufferedOutputStream? = null
    private var running = false
    private var connectThread: Thread? = null
    private var readerThread: Thread? = null
    private var writerThread: Thread? = null
    private val latestFrame = AtomicReference<ByteArray?>(null)
    private val frameHeader = ByteBuffer.allocate(4)

    fun start() {
        if (running) return
        running = true
        connectThread = Thread({ connectLoop() }, "TcpConnect").also { it.start() }
    }

    fun stop() {
        running = false
        latestFrame.set(null)
        closeSocket()
        connectThread?.interrupt()
        readerThread?.interrupt()
        writerThread?.interrupt()
        connectThread = null
        readerThread = null
        writerThread = null
        onConnected(false)
    }

    fun submitFrame(jpeg: ByteArray) {
        latestFrame.set(jpeg)
    }

    val isConnected: Boolean
        get() = running && socket?.isConnected == true

    fun reconnect() {
        if (!running) return
        closeSocket()
        readerThread?.interrupt()
        writerThread?.interrupt()
        readerThread = null
        writerThread = null
        connectThread?.interrupt()
        onConnected(false)
    }

    private fun connectLoop() {
        while (running) {
            try {
                val sock = Socket()
                sock.tcpNoDelay = true
                sock.keepAlive = true
                sock.connect(InetSocketAddress(host, port), 4_000)
                socket = sock
                output = BufferedOutputStream(sock.getOutputStream())
                onConnected(true)
                onError("")

                readerThread = Thread({ readLoop(sock) }, "TcpRead").also { it.start() }
                writerThread = Thread({ writeLoop() }, "TcpWrite").also { it.start() }
                readerThread?.join()
                writerThread?.join()
            } catch (e: Exception) {
                if (running) {
                    Log.w(tag, "connect failed: ${e.message}")
                    onConnected(false)
                    onError("TCP 连接失败 ($host:$port)")
                }
            } finally {
                closeSocket()
                onConnected(false)
            }
            if (running) {
                try {
                    Thread.sleep(500)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }
    }

    private fun writeLoop() {
        val out = output ?: return
        while (running && socket?.isConnected == true) {
            val frame = latestFrame.getAndSet(null)
            if (frame == null) {
                try {
                    Thread.sleep(2)
                } catch (_: InterruptedException) {
                    break
                }
                continue
            }
            try {
                frameHeader.clear()
                frameHeader.putInt(frame.size)
                out.write(frameHeader.array())
                out.write(frame)
                out.flush()
            } catch (e: Exception) {
                if (running) Log.w(tag, "write failed", e)
                break
            }
        }
    }

    private fun readLoop(sock: Socket) {
        val input = BufferedInputStream(sock.getInputStream())
        val lenBuf = ByteArray(4)
        while (running) {
            try {
                if (!readExact(input, lenBuf, 4)) break
                val length = ByteBuffer.wrap(lenBuf).int
                if (length < 1 || length > 4 * 1024 * 1024) break
                val payload = ByteArray(length)
                if (!readExact(input, payload, length)) break
                onResult(JSONObject(String(payload, Charsets.UTF_8)))
            } catch (e: Exception) {
                if (running) Log.w(tag, "read failed", e)
                break
            }
        }
    }

    private fun readExact(input: BufferedInputStream, buffer: ByteArray, size: Int): Boolean {
        var offset = 0
        while (offset < size) {
            val read = input.read(buffer, offset, size - offset)
            if (read < 0) return false
            offset += read
        }
        return true
    }

    private fun closeSocket() {
        try {
            output?.close()
        } catch (_: Exception) {
        }
        try {
            socket?.close()
        } catch (_: Exception) {
        }
        output = null
        socket = null
    }
}
