import EventNoteIcon from "@mui/icons-material/EventNote";
import FaceRetouchingNaturalIcon from "@mui/icons-material/FaceRetouchingNatural";
import GroupsIcon from "@mui/icons-material/Groups";
import MonitorIcon from "@mui/icons-material/Monitor";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import QuizIcon from "@mui/icons-material/Quiz";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import {
  AppBar,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useI18n } from "../i18n/I18nProvider";
import { navItems } from "../theme/m3Theme";

const DRAWER_WIDTH = 260;

const iconMap = {
  face: FaceRetouchingNaturalIcon,
  person_add: PersonAddIcon,
  groups: GroupsIcon,
  attendance: EventNoteIcon,
  quiz: QuizIcon,
  smart_toy: SmartToyIcon,
  monitor: MonitorIcon,
  rokid: ViewInArIcon,
};

export function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();

  const currentNav = navItems.find((item) => item.path === location.pathname);
  const title = currentNav ? t(currentNav.labelKey) : "NameFaceAI";

  const drawer = (
    <Box sx={{ py: 2, height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2.5, pb: 2 }}>
        <Typography variant="h6" color="primary" sx={{ fontWeight: 600 }}>
          NameFaceAI
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("brand.subtitle")}
        </Typography>
      </Box>
      <List sx={{ px: 1, flex: 1 }}>
        {navItems.map(({ path, labelKey, icon }) => {
          const Icon = iconMap[icon];
          const selected = location.pathname === path;
          return (
            <ListItemButton
              key={path}
              selected={selected}
              onClick={() => navigate(path)}
              sx={{
                borderRadius: 3,
                mb: 0.5,
                "&.Mui-selected": {
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  "& .MuiListItemIcon-root": { color: "primary.dark" },
                  "&:hover": { bgcolor: "primary.light" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Icon />
              </ListItemIcon>
              <ListItemText
                primary={t(labelKey)}
                sx={{ "& .MuiTypography-root": { fontWeight: selected ? 600 : 400 } }}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              borderRight: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            },
          }}
        >
          {drawer}
        </Drawer>
      )}

      <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: "background.paper",
            color: "text.primary",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Toolbar>
            <Typography variant="h5" component="h1" sx={{ flex: 1 }}>
              {title}
            </Typography>
            <LanguageSwitcher />
          </Toolbar>
        </AppBar>

        {isMobile && (
          <Box
            sx={{
              display: "flex",
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
              overflowX: "auto",
            }}
          >
            {navItems.map(({ path, labelKey, icon }) => {
              const Icon = iconMap[icon];
              const selected = location.pathname === path;
              return (
                <ListItemButton
                  key={path}
                  selected={selected}
                  onClick={() => navigate(path)}
                  sx={{
                    flexDirection: "column",
                    py: 1,
                    minWidth: 72,
                    borderRadius: 0,
                    "&.Mui-selected": { color: "primary.main" },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mb: 0.25 }}>
                    <Icon fontSize="small" />
                  </ListItemIcon>
                  <Typography variant="caption">{t(labelKey)}</Typography>
                </ListItemButton>
              );
            })}
          </Box>
        )}

        <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, maxWidth: 960, width: "100%", mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
