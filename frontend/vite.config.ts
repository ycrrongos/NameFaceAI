import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devHttp = process.env.DEV_HTTP === "1";

export default defineConfig({
  plugins: [react(), ...(devHttp ? [] : [basicSsl()])],
  server: {
    host: true,
    port: devHttp ? 5174 : 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
        changeOrigin: true,
      },
      "/phone-cam": {
        target: "http://127.0.0.1:8765",
        rewrite: (path) => path.replace(/^\/phone-cam/, ""),
      },
    },
  },
});
