import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.godofnoone.hosnobe",
  appName: "Hosn Obe",
  webDir: "dist",
  // Dev: WebView is served from https://localhost; allow it to reach the plain-http LAN server.
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Android 16 forces edge-to-edge: light status-bar icons on our dark UI, insets exposed to CSS.
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
};

export default config;
