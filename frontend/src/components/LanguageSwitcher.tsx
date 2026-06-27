import LanguageIcon from "@mui/icons-material/Language";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { Locale } from "../i18n/types";

const options: { value: Locale; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const current = options.find((o) => o.value === locale)?.label ?? locale;

  return (
    <>
      <Tooltip title={current}>
        <IconButton
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Language"
          sx={compact ? { color: "inherit" } : undefined}
        >
          <LanguageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {options.map(({ value, label }) => (
          <MenuItem
            key={value}
            selected={locale === value}
            onClick={() => {
              setLocale(value);
              setAnchor(null);
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
