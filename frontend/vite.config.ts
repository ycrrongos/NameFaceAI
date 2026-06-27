import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
      "/phone-cam": {
        target: "http://127.0.0.1:8765",
        rewrite: (path) => path.replace(/^\/phone-cam/, ""),
      },
    },
  },
});
