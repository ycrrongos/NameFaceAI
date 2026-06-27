# NameFaceAI — 学生人脸记名系统

帮助教师通过普通 USB/内置摄像头，在本地 GPU/CPU 电脑上实时识别人脸并显示学生姓名。

## 架构

```
浏览器采集摄像头 → InsightFace 推理（独显/集显/CPU 自动选择）→ SQLite 存储 → React 实时标注
                                                              ↓
                                                    云端/本地 LLM 助手（非实时）
```

## 环境要求

| 组件 | 要求 |
|------|------|
| 独显 | NVIDIA 显卡（推荐 ≥4GB VRAM），CUDA 12.x / 13.x |
| 集显 | Intel 核显（需安装 `onnxruntime-openvino`）或 Windows DirectML |
| 无 GPU | 自动降级 CPU 推理（较慢但可用） |
| Python | 3.11+（推荐，3.14 与部分依赖不兼容） |
| Node.js | 18+ |
| 摄像头 | USB 或内置，720p 以上（教室场景推荐 1080p） |

### 推理后端自动选择

启动时按以下顺序尝试，首个可用即采用：

1. **NVIDIA 独显** — `CUDAExecutionProvider`（需 `onnxruntime-gpu` + CUDA 驱动）
2. **AMD 独显** — `ROCMExecutionProvider`
3. **Intel 集显** — `OpenVINOExecutionProvider`（需 `pip install onnxruntime-openvino`）
4. **Windows 集显/独显** — `DmlExecutionProvider`（Windows 自带）
5. **CPU** — `CPUExecutionProvider`（兜底）

### 依赖安装

**有 NVIDIA 独显（推荐）：**

```bash
pip install -r requirements.txt          # 含 onnxruntime-gpu
# Fedora/RHEL 还需 CUDA 运行时：sudo dnf install cuda-cudart cuda-cudnn cuda-libs libcublas
```

**纯 CPU / 无 NVIDIA 驱动：**

```bash
pip install -r requirements-cpu.txt      # 含 onnxruntime（CPU 版）
```

**Intel 集显加速（可选）：**

```bash
pip install -r requirements-cpu.txt
pip install onnxruntime-openvino
```

## 快速开始

### 1. 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # 可选：配置 LLM
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

首次启动会自动下载 InsightFace `buffalo_l` 模型（约 326MB）到 `~/.insightface/models/`。

### 2. 前端

```bash
cd frontend
npm install
npm run dev
```

### 3. 一键启动

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

浏览器打开 **https://localhost:5173**（摄像头需 HTTPS，自签名证书可继续访问）

### 4. Rokid 眼镜 Android 套壳

```bash
./scripts/build-rokid-apk.sh
adb install -r rokid-android/app/build/outputs/apk/debug/app-debug.apk
```

详见 [rokid-android/README.md](rokid-android/README.md)。套壳 App 全屏加载 `/rokid?backend=电脑IP:8000`，电脑端可用 **Rokid 预览** 页（`/rokid-preview`）监视识别画面。

HTTP 开发模式（部分 Android WebView 场景）：`DEV_HTTP=1 npm run dev` → http://localhost:5174

## 使用流程

1. **录入学生**：拍摄或上传照片，支持名牌 OCR 自动识别姓名
2. **实时识别**：摄像头自动标注姓名，并自动记录考勤
3. **考勤表**：查看/编辑每日出勤
4. **学生管理**：编辑、删除、重新录入人脸
5. **Rokid 眼镜**：App 内仅显示识别框；浏览器 `/rokid` 可预览姓名与打卡状态
6. **AI 助手**（可选）：配置 LLM 后，可生成记忆口诀、查询档案

## LLM 配置（可选）

编辑 `backend/.env`：

```env
# 通义千问
LLM_PROVIDER=dashscope
DASHSCOPE_API_KEY=sk-xxx

# 或 DeepSeek
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx

# 或本地 Ollama（GPU）
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:7b
```

未配置 LLM 不影响人脸识别功能。

## API

| 路径 | 说明 |
|------|------|
| `GET /api/health` | GPU 状态、推理耗时 |
| `WS /ws/recognize` | 实时人脸识别 + 自动考勤 |
| `WS /ws/preview` | Rokid 桌面预览广播 |
| `GET/POST /api/students` | 学生 CRUD |
| `POST /api/students/enroll` | 录入学生 + 人脸 |
| `POST /api/ocr/name-tag` | 名牌 OCR 识别 |
| `GET /api/attendance` | 考勤表 |
| `POST /api/llm/chat` | AI 助手对话 |

完整文档：http://localhost:8000/docs

## 数据存储

- 数据库：`data/nameface.db`
- 人脸缩略图：`data/faces/{student_id}/`

默认使用 `buffalo_l`（SCRFD-10G + ResNet50，`det_size=960`，远距与速度兼顾），可在 `backend/.env` 调整：

```env
FACE_MODEL_NAME=buffalo_l
FACE_DET_SIZE=960
FACE_DET_THRESH=0.35
FACE_MIN_IMAGE_SIZE=720
FACE_MAX_IMAGE_SIZE=1280
FACE_MATCH_THRESHOLD=0.45
```

需要更高精度可改用 `antelopev2` + `FACE_DET_SIZE=1280`（约慢一倍）。切换模型后需重新录入人脸。

## 识别阈值

默认余弦相似度阈值 `0.45`，可在 `backend/.env` 中调整：

```env
FACE_MATCH_THRESHOLD=0.45
```
