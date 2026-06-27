#!/usr/bin/env bash
# 使用 Nexzuku 同款 Gradle 环境构建 NameFace Rokid APK
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROKID="$ROOT/rokid-android"
NEXZUKU="${NEXZUKU_DIR:-/home/rong/Nexzuku}"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"

if [[ ! -f "$ROKID/local.properties" ]]; then
  if [[ -f "$NEXZUKU/local.properties" ]]; then
    grep '^sdk.dir=' "$NEXZUKU/local.properties" > "$ROKID/local.properties"
    echo "已从 Nexzuku 复制 sdk.dir"
  else
    echo "请创建 rokid-android/local.properties 并设置 sdk.dir" >&2
    exit 1
  fi
fi

cd "$ROKID"
./gradlew :app:assembleDebug "$@"

APK="$ROKID/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]]; then
  echo ""
  echo "APK: $APK"
  echo "安装: adb install -r $APK"
fi
