# NameFace Rokid — Android 套壳

在 Rokid 眼镜上运行的 WebView 套壳，全屏加载 NameFaceAI 眼镜端 HUD（`/rokid`）。

## 功能

- 全屏横屏沉浸式界面，适合眼镜显示
- 自动申请摄像头权限（WebView `getUserMedia`）
- 可配置前端 / 后端地址（右下角设置按钮）
- 支持 HTTPS 自签名证书（Vite 开发环境）
- 默认加载：`https://<前端IP>:5173/rokid?backend=<后端IP>:8000`

## 环境要求

- Android Studio Ladybug+ 或 JDK 17 + Android SDK 35
- Rokid 眼镜与运行 NameFaceAI 的电脑在同一局域网

## 构建 APK

本项目复用本地 Nexzuku 项目的 Gradle 环境（阿里云 Maven 镜像 + Gradle 8.13），避免 Google Maven 依赖下载失败。

**一键构建（推荐）：**

```bash
./scripts/build-rokid-apk.sh
# 输出：rokid-android/app/build/outputs/apk/debug/app-debug.apk
```

或手动构建：

```bash
cd rokid-android
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
# local.properties 可从 ../Nexzuku/local.properties 复制 sdk.dir
./gradlew :app:assembleDebug
```

也可直接用 Android Studio 打开 `rokid-android` 目录，连接眼镜或模拟器运行。

## 安装到 Rokid 眼镜

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 首次配置

1. 在电脑上启动 NameFaceAI（`./scripts/dev.sh`）
2. 查看电脑局域网 IP，例如 `192.168.1.10`
3. 打开眼镜端 App，点右下角 **设置**
4. 填写：
   - 前端地址：`192.168.1.10:5173`
   - 后端地址：`192.168.1.10:8000`
   - 开启 HTTPS（Vite 默认）和「信任自签名证书」
5. 保存后自动进入识别界面

## 网络说明

| 组件 | 默认端口 | 说明 |
|------|----------|------|
| 前端 Vite | 5173 | HTTPS，提供 `/rokid` 页面 |
| 后端 FastAPI | 8000 | 人脸识别 API / WebSocket |

确保电脑防火墙放行 5173、8000 端口。

## 与浏览器访问的区别

套壳 App 解决了眼镜浏览器中常见的：

- 摄像头权限需每次手动授权
- 自签名 HTTPS 证书拦截
- 无法全屏常驻识别界面
