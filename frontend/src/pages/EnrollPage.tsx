import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { CameraView } from "../components/CameraView";

export function EnrollPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [notes, setNotes] = useState("");
  const [captured, setCaptured] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const capturePhoto = () => {
    const video = document.querySelector(".camera-video") as HTMLVideoElement | null;
    const canvas = previewRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCaptured((prev) => [...prev, dataUrl]);
  };

  const removePhoto = (index: number) => {
    setCaptured((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("请输入学生姓名");
      return;
    }
    if (captured.length < 1) {
      setError("请至少拍摄 1 张照片（建议 3–5 张不同角度）");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.enrollStudent({
        name: name.trim(),
        class_name: className.trim() || undefined,
        notes: notes.trim() || undefined,
        images: captured,
      });
      navigate("/students");
    } catch (e) {
      setError(e instanceof Error ? e.message : "录入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>录入学生</h1>
        <p className="subtitle">拍摄 3–5 张不同角度的照片，提高识别准确率</p>
      </header>

      <CameraView showOverlay={false} />

      <div className="form">
        <label>
          姓名 *
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="学生姓名" />
        </label>
        <label>
          班级
          <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="如：三班" />
        </label>
        <label>
          备注
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可选备注" rows={2} />
        </label>
      </div>

      <div className="actions">
        <button type="button" className="btn" onClick={capturePhoto}>
          拍照 ({captured.length})
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={loading}>
          {loading ? "提交中…" : "保存"}
        </button>
        <Link to="/" className="btn btn-link">
          取消
        </Link>
      </div>

      {error && <p className="error">{error}</p>}

      {captured.length > 0 && (
        <div className="photo-grid">
          {captured.map((img, i) => (
            <div key={i} className="photo-thumb">
              <img src={img} alt={`capture ${i + 1}`} />
              <button type="button" onClick={() => removePhoto(i)}>
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      <canvas ref={previewRef} style={{ display: "none" }} />
    </div>
  );
}
