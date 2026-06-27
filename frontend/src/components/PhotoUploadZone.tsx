import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { filesToDataUrls, UPLOAD_ACCEPT } from "../utils/imageUpload";

interface PhotoUploadZoneProps {
  onPhotosAdded: (dataUrls: string[]) => void;
  disabled?: boolean;
  multiple?: boolean;
}

export function PhotoUploadZone({
  onPhotosAdded,
  disabled = false,
  multiple = true,
}: PhotoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    if (disabled || files.length === 0) return;
    setLoading(true);
    setLocalError(null);
    try {
      const dataUrls = await filesToDataUrls(files);
      if (dataUrls.length > 0) onPhotosAdded(dataUrls);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Stack spacing={1.5}>
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          void handleFiles(e.dataTransfer.files);
        }}
        sx={{
          border: "2px dashed",
          borderColor: dragging ? "primary.main" : "divider",
          borderRadius: 3,
          bgcolor: dragging ? "action.hover" : "background.paper",
          px: 3,
          py: 5,
          textAlign: "center",
          transition: "border-color 0.2s, background-color 0.2s",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 40, color: "primary.main", mb: 1 }} />
        <Typography variant="subtitle1" gutterBottom>
          拖拽照片到此处，或点击选择文件
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          支持 JPG、PNG、WebP，可一次选择多张。建议上传 3–5 张不同角度的清晰人脸照片。
        </Typography>
        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          disabled={disabled || loading}
          onClick={() => inputRef.current?.click()}
        >
          {loading ? "处理中…" : "选择照片"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={UPLOAD_ACCEPT}
          multiple={multiple}
          onChange={(e) => {
            const files = e.target.files;
            if (files) void handleFiles(files);
          }}
        />
      </Box>
      {localError && (
        <Typography variant="body2" color="error">
          {localError}
        </Typography>
      )}
    </Stack>
  );
}
