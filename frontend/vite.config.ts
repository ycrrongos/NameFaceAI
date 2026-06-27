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
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});
