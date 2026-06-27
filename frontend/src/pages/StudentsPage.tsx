import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Student } from "../api/client";
import { CameraView } from "../components/CameraView";

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [reenrolling, setReenrolling] = useState<Student | null>(null);
  const [captured, setCaptured] = useState<string[]>([]);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const load = () => {
    setLoading(true);
    api
      .listStudents()
      .then(setStudents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.updateStudent(editing.id, {
        name: editing.name,
        class_name: editing.class_name ?? undefined,
        notes: editing.notes ?? undefined,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    }
  };

  const deleteStudent = async (id: number) => {
    if (!confirm("确定删除该学生？")) return;
    try {
      await api.deleteStudent(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const capturePhoto = () => {
    const video = document.querySelector(".camera-video") as HTMLVideoElement | null;
    const canvas = previewRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCaptured((prev) => [...prev, canvas.toDataURL("image/jpeg", 0.85)]);
  };

  const submitReenroll = async () => {
    if (!reenrolling || captured.length === 0) return;
    try {
      await api.reenrollStudent(reenrolling.id, {
        name: reenrolling.name,
        class_name: reenrolling.class_name ?? undefined,
        notes: reenrolling.notes ?? undefined,
        images: captured,
      });
      setReenrolling(null);
      setCaptured([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新录入失败");
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>学生管理</h1>
        <Link to="/enroll" className="btn btn-primary">
          录入新学生
        </Link>
      </header>

      {error && <p className="error">{error}</p>}
      {loading && <p>加载中…</p>}

      {!loading && students.length === 0 && (
        <p className="empty">暂无学生，<Link to="/enroll">去录入</Link></p>
      )}

      <table className="student-table">
        <thead>
          <tr>
            <th>姓名</th>
            <th>班级</th>
            <th>人脸数</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.class_name || "—"}</td>
              <td>{s.face_count}</td>
              <td className="notes-cell">{s.notes || "—"}</td>
              <td className="actions-cell">
                <button type="button" className="btn btn-sm" onClick={() => setEditing({ ...s })}>
                  编辑
                </button>
                <button type="button" className="btn btn-sm" onClick={() => { setReenrolling(s); setCaptured([]); }}>
                  重录人脸
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteStudent(s.id)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal">
          <div className="modal-content">
            <h2>编辑学生</h2>
            <label>
              姓名
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label>
              班级
              <input
                value={editing.class_name ?? ""}
                onChange={(e) => setEditing({ ...editing, class_name: e.target.value })}
              />
            </label>
            <label>
              备注
              <textarea
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                rows={3}
              />
            </label>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={saveEdit}>
                保存
              </button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {reenrolling && (
        <div className="modal">
          <div className="modal-content modal-wide">
            <h2>重新录入人脸 — {reenrolling.name}</h2>
            <CameraView showOverlay={false} />
            <div className="actions">
              <button type="button" className="btn" onClick={capturePhoto}>
                拍照 ({captured.length})
              </button>
              <button type="button" className="btn btn-primary" onClick={submitReenroll} disabled={captured.length === 0}>
                提交
              </button>
              <button type="button" className="btn" onClick={() => { setReenrolling(null); setCaptured([]); }}>
                取消
              </button>
            </div>
            {captured.length > 0 && (
              <div className="photo-grid">
                {captured.map((img, i) => (
                  <img key={i} src={img} alt={`capture ${i + 1}`} className="photo-thumb-img" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <canvas ref={previewRef} style={{ display: "none" }} />
    </div>
  );
}
