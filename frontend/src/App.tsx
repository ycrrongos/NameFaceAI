import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { AssistantPage } from "./pages/AssistantPage";
import { EnrollPage } from "./pages/EnrollPage";
import { RecognizePage } from "./pages/RecognizePage";
import { StudentsPage } from "./pages/StudentsPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav">
          <div className="nav-brand">NameFaceAI</div>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            实时识别
          </NavLink>
          <NavLink to="/enroll" className={({ isActive }) => (isActive ? "active" : "")}>
            录入
          </NavLink>
          <NavLink to="/students" className={({ isActive }) => (isActive ? "active" : "")}>
            学生管理
          </NavLink>
          <NavLink to="/assistant" className={({ isActive }) => (isActive ? "active" : "")}>
            AI 助手
          </NavLink>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<RecognizePage />} />
            <Route path="/enroll" element={<EnrollPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
