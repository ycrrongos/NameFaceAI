const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export interface Student {
  id: number;
  name: string;
  class_name: string | null;
  notes: string | null;
  created_at: string;
  face_count: number;
}

export interface FaceMatch {
  bbox: number[];
  name: string;
  student_id: number | null;
  confidence: number;
}

export interface RecognizeResult {
  faces: FaceMatch[];
  inference_ms: number;
}

export interface HealthInfo {
  status: string;
  gpu: boolean;
  provider: string;
  inference_ms: number | null;
  model_loaded: boolean;
  llm_provider: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || resp.statusText);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export const api = {
  health: () => request<HealthInfo>("/api/health"),
  listStudents: () => request<Student[]>("/api/students"),
  getStudent: (id: number) => request<Student>(`/api/students/${id}`),
  createStudent: (data: { name: string; class_name?: string; notes?: string }) =>
    request<Student>("/api/students", { method: "POST", body: JSON.stringify(data) }),
  updateStudent: (
    id: number,
    data: { name?: string; class_name?: string; notes?: string }
  ) =>
    request<Student>(`/api/students/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteStudent: (id: number) =>
    request<void>(`/api/students/${id}`, { method: "DELETE" }),
  enrollStudent: (data: {
    name: string;
    class_name?: string;
    notes?: string;
    images: string[];
  }) =>
    request<Student>("/api/students/enroll", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  reenrollStudent: (
    id: number,
    data: { name: string; class_name?: string; notes?: string; images: string[] }
  ) =>
    request<Student>(`/api/students/${id}/enroll`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  chat: (messages: { role: string; content: string }[]) =>
    request<{ reply: string; provider: string }>("/api/llm/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
};

export const WS_RECOGNIZE_URL =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws/recognize";
