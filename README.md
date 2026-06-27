# NameFaceAI — 学生人脸记名系统

帮助教师通过普通 USB/内置摄像头，在本地 NVIDIA GPU 电脑上实时识别人脸并显示学生姓名。

## 架构

```
浏览器采集摄像头 → GPU 加速 InsightFace 推理 → SQLite 存储 → React 实时标注
                                                      ↓
                                            云端/本地 LLM 助手（非实时）
```

## 环境要求

| 组件 | 要求 |
|------|------|
| GPU | NVIDIA 显卡（推荐 ≥4GB VRAM），CUDA 11.8 或 12.x |
| 驱动 | 最新 NVIDIA 驱动 |
| Python | 3.11+ |
| Node.js | 18+ |
| 摄像头 | USB 或内置，720p 即可 |

### onnxruntime-gpu 与 CUDA 版本

| onnxruntime-gpu | CUDA |
|-----------------|------|
| 1.19.x | 12.x |
| 1.18.x | 12.x / 11.8 |

无 GPU 时系统自动降级 CPU 推理（较慢但可用）。

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

首次启动会自动下载 InsightFace `buffalo_l` 模型（约 300MB）到 `~/.insightface/models/`。

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

浏览器打开 **http://localhost:5173**

## 使用流程

1. **录入学生**：进入「录入」页，拍摄 3–5 张不同角度照片，填写姓名/班级
2. **实时识别**：进入「实时识别」页，摄像头画面中自动标注学生姓名
3. **学生管理**：编辑、删除、重新录入人脸
4. **AI 助手**（可选）：配置 LLM 后，可生成记忆口诀、查询档案

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
| `WS /ws/recognize` | 实时人脸识别 |
| `GET/POST /api/students` | 学生 CRUD |
| `POST /api/students/enroll` | 录入学生 + 人脸 |
| `POST /api/llm/chat` | AI 助手对话 |

完整文档：http://localhost:8000/docs

## 数据存储

- 数据库：`data/nameface.db`
- 人脸缩略图：`data/faces/{student_id}/`

## 识别阈值

默认余弦相似度阈值 `0.45`，可在 `backend/.env` 中调整：

```env
FACE_MATCH_THRESHOLD=0.45
```
