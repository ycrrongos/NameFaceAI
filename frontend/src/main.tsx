import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "./i18n/I18nProvider.tsx";
import { AppLayout } from "./layout/AppLayout.tsx";
import { AssistantPage } from "./pages/AssistantPage.tsx";
import { AttendancePage } from "./pages/AttendancePage.tsx";
import { EnrollPage } from "./pages/EnrollPage.tsx";
import { GlassesPage } from "./pages/GlassesPage.tsx";
import { PracticePage } from "./pages/PracticePage.tsx";
import { RecognizePage } from "./pages/RecognizePage.tsx";
import { RokidPreviewPage } from "./pages/RokidPreviewPage.tsx";
import { StudentsPage } from "./pages/StudentsPage.tsx";
import { m3Theme } from "./theme/m3Theme.ts";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={m3Theme} defaultMode="light">
      <CssBaseline />
      <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/rokid" element={<GlassesPage />} />
          <Route path="/glasses" element={<GlassesPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<RecognizePage />} />
            <Route path="/recognize" element={<RecognizePage />} />
            <Route path="/enroll" element={<EnrollPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/rokid-preview" element={<RokidPreviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
);
