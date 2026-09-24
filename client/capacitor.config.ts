import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.godofnoone.hosnobe",
  appName: "Hosn Obe",
  webDir: "dist",
  // Dev: WebView is served from https://localhost; allow it to reach the plain-http LAN server.
  android: {
    allowMixedContent: true,
  },
};

export default config;
