import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base: "./"` makes built asset paths relative so the bundle also loads from
// the file:// origin inside Capacitor's Android WebView.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
