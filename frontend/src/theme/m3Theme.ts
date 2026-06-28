import { createTheme } from "@mui/material/styles";

/** Material Design 3 — 浅色主题（NameFaceAI 教室工具风） */
export const m3Theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "class",
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: "#6750A4",
          light: "#EADDFF",
          dark: "#21005D",
          contrastText: "#FFFFFF",
        },
        secondary: {
          main: "#625B71",
          light: "#E8DEF8",
          dark: "#1D192B",
          contrastText: "#FFFFFF",
        },
        error: {
          main: "#B3261E",
          light: "#F9DEDC",
          contrastText: "#FFFFFF",
        },
        success: {
          main: "#386A20",
          light: "#C4EED0",
        },
        background: {
          default: "#FEF7FF",
          paper: "#FFFBFE",
        },
        divider: "#CAC4D0",
      },
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"Roboto", "Noto Sans SC", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 400, letterSpacing: 0 },
    h5: { fontWeight: 500 },
    h6: { fontWeight: 500 },
    button: { textTransform: "none", fontWeight: 500 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 20, paddingInline: 24 },
        contained: { borderRadius: 20 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid",
          borderColor: "var(--mui-palette-divider)",
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: { borderRadius: 16 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 28 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
  },
});

export const navItems = [
  { path: "/", label: "实时识别", icon: "face" as const },
  { path: "/enroll", label: "录入学生", icon: "person_add" as const },
  { path: "/students", label: "学生管理", icon: "groups" as const },
  { path: "/attendance", label: "考勤表", icon: "attendance" as const },
  { path: "/practice", label: "记名练习", icon: "quiz" as const },
  { path: "/assistant", label: "AI 助手", icon: "smart_toy" as const },
  { path: "/rokid-preview", label: "Rokid 预览", icon: "monitor" as const },
  { path: "/rokid", label: "Rokid 眼镜", icon: "rokid" as const },
] as const;
