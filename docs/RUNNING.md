# Running & simulating Hosn Obe

This is the hands-on runbook for playing the game during development: how to
start the server, how to simulate on a **PC** (browser), and how to simulate on
a **real Android phone** or an **emulator**.

The server is authoritative — every client (PC browser or phone) connects to the
**same** running server and shares room state in real time. So "multiplayer"
just means: start one server, then point two or more clients at it.

```
┌─────────────┐        ┌─────────────┐
│  PC browser │──┐     │   Phone APK │
│ localhost   │  │     │  LAN IP     │
└─────────────┘  │     └──────┬──────┘
                 ▼            ▼
          ┌────────────────────────┐
          │  Server (port 3000)    │  ← authoritative game state
          └────────────────────────┘
```

---

## 1. Prerequisites

| Tool | Needed for | Notes |
|------|-----------|-------|
| Node.js ≥ 20 | server + client | developed on Node 24 |
| npm ≥ 10 | workspaces | bundled with Node |
| JDK 21 (64-bit) | building the Android APK | Microsoft OpenJDK 21; Gradle 8.14.3 does **not** support JDK 25 |
| Android SDK (platform 36, build-tools 36, platform-tools) | APK + device install | installed under `%LOCALAPPDATA%\Android\Sdk` |

On this machine the toolchain lives at:

- **JDK 21:** `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`
- **Android SDK:** `C:\Users\<you>\AppData\Local\Android\Sdk`

These are persisted as `JAVA_HOME` / `ANDROID_HOME` for new terminals (set once
via `setx`). In an **already-open** shell they may be missing — re-export them:

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
```

Install deps once from the repo root:

```bash
npm install
```

---

## 2. Start the server (required for every mode)

From the repo root:

```bash
npm run dev:server
```

- Listens on **http://localhost:3000** and binds to all interfaces, so other
  devices on your LAN can reach it at `http://<your-PC-LAN-IP>:3000`.
- Health check: open `http://localhost:3000/health` → `{"ok":true}`.
- Config via `server/.env` (optional — copy from `server/.env.example`):
  - `PORT` — default `3000`
  - `CLIENT_ORIGIN` — comma-separated allowlist, or `*` for local dev.

Leave this terminal running. Everything below connects to it.

---

## 3. Simulate on a PC (browser)

In a second terminal:

```bash
npm run dev:client
```

Open **http://localhost:5173**. The client defaults to `http://localhost:3000`
for the server (override with `VITE_SERVER_URL` in `client/.env`).

To play "multiplayer" on one PC:

1. Tab 1 → enter a name → **Create room** → copy the 5-char code.
2. Tab 2 (or an incognito window) → enter a different name → **Join** with the code.
3. Both tabs show each other in the seat list.

> The browser runs the **same web build** that is packaged into the APK, so this
> is the fastest way to see UI changes (Vite hot-reloads instantly).

---

## 4. Simulate on a real Android phone

The phone must be on the **same Wi-Fi/LAN** as the PC so it can reach the server.

### 4.1 Find the PC's LAN IP

```bash
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.IPAddress -notlike '169.*' -and \$_.IPAddress -ne '127.0.0.1' } | Select-Object IPAddress, InterfaceAlias | Format-Table -AutoSize"
```

Pick the LAN address (e.g. `10.100.102.74` on the Ethernet/Wi-Fi interface — not
a VPN adapter).

### 4.2 Point the APK at that IP

Edit `client/.env` (this file is git-ignored, so your IP stays local):

```
VITE_SERVER_URL=http://10.100.102.74:3000
```

> The APK bakes this URL in **at build time** — change it and you must rebuild
> (section 4.3). Inside an **emulator** the host PC is `http://10.0.2.2:3000`
> instead; on a **real phone** use the PC's LAN IP.

### 4.3 Build the APK

```bash
cd client
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
npm run build                 # web bundle (reads client/.env)
npx cap sync android          # copy web build + plugins into android/
(cd android && ./gradlew assembleDebug --no-daemon)
```

Output: `client/android/app/build/outputs/apk/debug/app-debug.apk`.

> **Dev networking settings** (already configured): the WebView is served from
> `https://localhost`, so reaching a plain-`http` LAN server needs
> `allowMixedContent: true` in `client/capacitor.config.ts` **and**
> `android:usesCleartextTraffic="true"` in the manifest. These are **dev-only**
> and must be removed/tightened before a release build (use `https`/`wss`).

### 4.4 Allow the server through Windows Firewall (once)

```bash
powershell -NoProfile -Command "Start-Process cmd.exe -Verb RunAs -Wait -ArgumentList '/c','netsh advfirewall firewall add rule name=\"Hosn Obe Server 3000\" dir=in action=allow protocol=TCP localport=3000'"
```

Accept the UAC prompt. Verify from the **phone's browser**: open
`http://<PC-LAN-IP>:3000/health`. Seeing `{"ok":true}` (or even "Cannot GET /")
means the phone can reach the server.

### 4.5 Connect the phone with `adb`

**Wireless debugging (recommended — no USB driver needed, Android 11+):**

1. Phone: **Settings → About phone → tap Build number 7×** to unlock Developer
   options.
2. **Settings → Developer options → Wireless debugging** → On.
3. Tap **"Pair device with pairing code"** — note its **IP:port** and the
   **6-digit code**, then pair:

   ```bash
   SDK="$LOCALAPPDATA/Android/Sdk"; ADB="$SDK/platform-tools/adb.exe"
   "$ADB" pair <IP>:<pair-port> <6-digit-code>
   "$ADB" devices        # device appears via mDNS after pairing
   ```

   > The pairing port and the main connect port **change each session**. If the
   > device shows `offline`, re-open the pairing dialog and pair again.

**USB (alternative):** enable **USB debugging** in Developer options, plug in,
accept the "Allow USB debugging" prompt. If `adb devices` is empty, the OEM USB
driver is missing — prefer wireless debugging above.

### 4.6 Install & launch

```bash
cd ~/Desktop/Hosn-Obe/client/android
SDK="$LOCALAPPDATA/Android/Sdk"; ADB="$SDK/platform-tools/adb.exe"
DEV=$("$ADB" devices | awk 'NR>1 && $2=="device"{print $1; exit}')
"$ADB" -s "$DEV" install -r app/build/outputs/apk/debug/app-debug.apk
"$ADB" -s "$DEV" shell monkey -p com.godofnoone.hosnobe -c android.intent.category.LAUNCHER 1
```

Now create a room on the phone and join it from the PC browser (or vice-versa)
to play across devices.

---

## 5. Simulate on an Android emulator (optional)

Requires **CPU virtualization enabled in BIOS/UEFI** (AMD: *SVM Mode*; Intel:
*VT-x*). Without it the x86_64 emulator cannot start — check with:

```bash
systeminfo | grep -i "Virtualization Enabled In Firmware"
```

If it says **No**, enable it in BIOS first. Then:

```bash
SDK="$LOCALAPPDATA/Android/Sdk"
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot"
# one-time: install image + create a device
"$SDK/cmdline-tools/latest/bin/sdkmanager.bat" "emulator" "system-images;android-36;google_apis;x86_64"
"$SDK/cmdline-tools/latest/bin/avdmanager.bat" create avd -n hosnobe_pixel -k "system-images;android-36;google_apis;x86_64" -d pixel_6
# launch
"$SDK/emulator/emulator.exe" -avd hosnobe_pixel
```

For the emulator, set `VITE_SERVER_URL=http://10.0.2.2:3000` (the emulator's
alias for the host PC) and rebuild/reinstall the APK as in section 4.3/4.6.

---

## 6. Quick reference

| Task | Command |
|------|---------|
| Start server | `npm run dev:server` |
| Start PC client | `npm run dev:client` → http://localhost:5173 |
| Server health | open `http://localhost:3000/health` |
| PC LAN IP | `ipconfig` (IPv4 of your LAN adapter) |
| Build APK | `cd client && npm run build && npx cap sync android && (cd android && ./gradlew assembleDebug)` |
| List devices | `"$ANDROID_HOME/platform-tools/adb.exe" devices` |
| Install APK | `adb -s <device> install -r app/build/outputs/apk/debug/app-debug.apk` |

## 7. Troubleshooting

- **App says "offline" on the phone** → the WebView can't reach the server.
  Check: phone browser can open `http://<PC-IP>:3000/health`; firewall rule
  exists (4.4); `client/.env` has the **PC LAN IP** (not `localhost`/`10.0.2.2`);
  APK was rebuilt after changing `.env`.
- **`adb` device shows `offline` / connect refused** → wireless debugging port
  rotated; re-pair (4.5).
- **Gradle "Could not reserve enough space for object heap" / daemon won't
  start** → wrong Java. Use JDK 21: `export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot"`.
- **Emulator "requires hardware acceleration"** → enable SVM/VT-x in BIOS (5).
