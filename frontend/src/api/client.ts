import { getApiBase, getWsRecognizeUrl } from "../config/runtime";

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

export interface AttendanceCheckIn {
  student_id: number;
  name: string;
  checked_in: boolean;
  newly_marked: boolean;
  source: string | null;
}

export interface RecognizeResult {
  faces: FaceMatch[];
  inference_ms: number;
  attendance?: AttendanceCheckIn[];
  frame_width?: number | null;
  frame_height?: number | null;
}

export interface HealthInfo {
  status: string;
  gpu: boolean;
  accelerator: "gpu" | "igpu" | "cpu";
  provider: string;
  inference_ms: number | null;
  model_loaded: boolean;
  face_model_name?: string | null;
  face_det_size?: number | null;
  llm_provider: string | null;
}

export interface NameTagOcrResult {
  name: string | null;
  class_name: string | null;
  confidence: number;
  raw_text: string | null;
  face_detected: boolean;
  face_bbox: number[] | null;
  ocr_lines: string[];
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface AttendanceRow {
  student_id: number;
  name: string;
  class_name: string | null;
  status: AttendanceStatus | null;
  source: "manual" | "auto" | null;
  notes: string | null;
  marked_at: string | null;
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
}

export interface PracticeProgress {
  round: number;
  round_answered: number;
  round_total: number;
  mastered: number;
  remaining: number;
  session_total: number;
}

export interface PracticeQuestion {
  session_id: number;
  target_student_id: number;
  photo_base64: string | null;
  options: string[];
  round: number;
  progress: PracticeProgress;
  adaptation_hint: string | null;
}

export interface PracticeAnswerResponse {
  correct: boolean;
  correct_name: string;
  chosen_name: string;
  round_complete: boolean;
  session_complete: boolean;
  progress: PracticeProgress;
  feedback: string | null;
}

export interface PracticeAttemptRecord {
  id: number;
  round_number: number;
  target_student_id: number;
  target_name: string;
  chosen_name: string;
  correct_name: string;
  is_correct: boolean;
  created_at: string;
}

export interface PracticeSessionSummary {
  id: number;
  class_name: string | null;
  status: string;
  round_number: number;
  mastered: number;
  total_students: number;
  wrong_count: number;
  attempts: PracticeAttemptRecord[];
}

export interface AttendanceSheet {
  date: string;
  rows: AttendanceRow[];
  summary: AttendanceSummary;
}

function apiBase(): string {
  return getApiBase();
}

export function wsRecognizeUrl(): string {
  return getWsRecognizeUrl();
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${apiBase()}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text();
    let message = text || resp.statusText;
    try {
      const json = JSON.parse(text) as { detail?: string | { msg?: string }[] };
      if (typeof json.detail === "string") message = json.detail;
      else if (Array.isArray(json.detail)) {
        message = json.detail.map((d) => d.msg ?? String(d)).join("；");
      }
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
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
  detectNameTag: (image: string) =>
    request<NameTagOcrResult>("/api/ocr/name-tag", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),
  enrollFromNameTag: (data: {
    images: string[];
    name?: string;
    class_name?: string;
    notes?: string;
  }) =>
    request<Student>("/api/ocr/enroll-nametag", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAttendanceSheet: (date: string, class_name?: string) => {
    const params = new URLSearchParams({ date });
    if (class_name) params.set("class_name", class_name);
    return request<AttendanceSheet>(`/api/attendance?${params}`);
  },
  markAttendance: (data: {
    student_id: number;
    date: string;
    status: AttendanceStatus;
    notes?: string;
  }) =>
    request<AttendanceSheet>("/api/attendance/mark", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  markAllAttendance: (data: { date: string; status: AttendanceStatus }) =>
    request<AttendanceSheet>("/api/attendance/mark-all", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  chat: (messages: { role: string; content: string }[]) =>
    request<{ reply: string; provider: string }>("/api/llm/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
  startPracticeSession: (data: { class_name?: string }) =>
    request<{ session_id: number; round: number }>("/api/practice/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPracticeQuestion: (sessionId: number) =>
    request<PracticeQuestion>(`/api/practice/sessions/${sessionId}/question`),
  submitPracticeAnswer: (
    sessionId: number,
    data: { target_student_id: number; chosen_name: string }
  ) =>
    request<PracticeAnswerResponse>(`/api/practice/sessions/${sessionId}/answer`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPracticeSummary: (sessionId: number) =>
    request<PracticeSessionSummary>(`/api/practice/sessions/${sessionId}/summary`),
};

/** @deprecated use wsRecognizeUrl() */
export const WS_RECOGNIZE_URL =
  typeof window !== "undefined" ? getWsRecognizeUrl() : "ws://localhost:8000/ws/recognize";
