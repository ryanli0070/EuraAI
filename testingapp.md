# Testing EuraAI on an iPad (Xcode)

EuraAI is a React + Vite web app wrapped in a native iOS shell with **Capacitor**.
You don't need to know Swift — your web code runs inside the native app. This
guide gets the app running on your own iPad.

> TL;DR
> ```bash
> cd frontend
> npm install
> npm run build
> npx cap sync ios
> npx cap open ios     # then set your signing team + run on your iPad (see step 4)
> ```

---

## 1. One-time machine setup

1. **Install Xcode** from the Mac App Store, then **open it once** so it installs
   the "additional required components" and you accept the license. Then point the
   command-line tools at it:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   xcodebuild -version      # should print Xcode 16 or newer
   ```
2. **Node 20+** (check with `node -v`). If you don't have it:
   ```bash
   brew install node        # or install from https://nodejs.org
   ```
3. **CocoaPods is NOT required.** This project uses Capacitor 8, which manages iOS
   plugins via Swift Package Manager. Skip any `pod install` instructions you find
   online for older Capacitor versions.

---

## 2. Get the code and build the web bundle

```bash
git clone https://github.com/ryanli0070/EuraAI.git   # (or `git pull` if you already have it)
cd EuraAI/frontend
npm install          # installs Capacitor + all deps
npm run build        # builds dist/  ← REQUIRED: dist/ is gitignored
npx cap sync ios     # copies dist/ into the native iOS project
```

⚠️ **Don't skip `npm run build`.** The compiled web app (`dist/`) is not committed
to git, so without this step the app launches to a blank white screen.

The backend is already configured — `frontend/.env.production` points the app at the
live API (AWS App Runner) and Supabase, and those keys are public/committed. **You do
not need any secrets** to build and test.

---

## 3. Open the project in Xcode

```bash
npx cap open ios
```
This opens `frontend/ios/App/App.xcodeproj` in Xcode. Give it a few seconds to finish
indexing (progress bar at the top).

---

## 4. Sign it with YOUR Apple ID and run on YOUR iPad

This is the part that's unique to you — the project's signing won't transfer.

1. In the **left sidebar**, click the blue **App** project at the top.
2. Select **TARGETS → App**, then the **Signing & Capabilities** tab.
3. **Team** → *Add an Account…* → sign in with **your** Apple ID (a free account is
   fine) → then select your name's **"(Personal Team)"**.
4. **Change the Bundle Identifier** to something unique to you, e.g.
   `com.<yourname>.euraai`.
   - Two free Apple IDs can't share the same bundle ID, so you **can't** reuse the
     default `com.visfuture.euraai` — you'll see *"Failed to register bundle
     identifier"* until you change it.
   - ⚠️ **Do NOT commit this change.** It edits a tracked file
     (`frontend/ios/App/App.xcodeproj/project.pbxproj`). Before committing anything,
     restore it so you don't overwrite everyone else's signing:
     ```bash
     git restore frontend/ios/App/App.xcodeproj/project.pbxproj
     ```
5. **Plug your iPad into the Mac** with a cable. On the iPad, tap **Trust** if asked.
6. In Xcode's **device dropdown** (top center), pick your iPad (under *iOS Device*),
   not a simulator.
7. Press **▶ Run** (or ⌘R). Xcode builds, installs, and launches it.
8. **First launch only** — it fails with *"Untrusted Developer."* On the iPad go to
   **Settings → General → VPN & Device Management → [your Apple ID] → Trust**, then
   reopen EuraAI from the home screen.

Done — you have the real native app on your iPad, talking to the same production
backend as everyone else.

> The free certificate **expires after 7 days**. When the app stops opening, just
> press ▶ in Xcode again to refresh it. (A paid Apple Developer Program account
> removes this limit and unlocks TestFlight.)

---

## 5. Everyday loop — getting your code changes into the app

Capacitor ships the **web build**, so any change has to be rebuilt and copied in:

```bash
cd frontend
npm run build        # 1. rebuild dist/  (also runs tsc — a type error stops it here)
npx cap sync ios     # 2. copy dist/ into the iOS project
# 3. press ▶ in Xcode  (or:  npx cap run ios)
```

### Faster: live-reload while developing
Run once, and edits hot-reload **inside the native app** with no rebuild/sync:
```bash
cd frontend
npx cap run ios --livereload --external
```
(Mac and iPad must be on the same Wi-Fi.) Stop it with Ctrl-C when done.

⚠️ **Live-reload backend gotcha:** in dev mode the app calls `localhost:8000`, which on
the iPad means the iPad itself (nothing there). Either point the dev server at the
hosted backend by adding this to `frontend/.env.local`:
```
VITE_API_BASE_URL=https://t8tutmtkjt.us-east-1.awsapprunner.com
```
or run the backend on your Mac's LAN IP. The normal `npm run build` path (step 5) does
**not** have this issue — it already targets the production backend.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank white screen on launch | You skipped `npm run build` (or didn't `npx cap sync ios` after it). |
| *"Failed to register bundle identifier"* | Change the Bundle Identifier to something unique (step 4.4). |
| *"Untrusted Developer"* on the iPad | Trust your cert: Settings → General → VPN & Device Management (step 4.8). |
| iPad not in the device dropdown | Replug the cable, tap **Trust** on the iPad, wait for Xcode to finish "preparing." |
| App opened before but won't now | Free signing cert expired (7 days) — re-run from Xcode. |
| Sign-in / "check work" fails in live-reload | Set `VITE_API_BASE_URL` in `.env.local` (see the live-reload gotcha). |
| `xcodebuild` / build errors after pulling | `cd frontend && npm install` again, then `npm run build && npx cap sync ios`. |

---

## How it fits together (for the curious)

- `frontend/` — the React + Vite app (the actual product).
- `frontend/capacitor.config.ts` — Capacitor config (`webDir: dist`, iOS tweaks).
- `frontend/ios/` — the generated native Xcode project (committed). You normally never
  edit Swift; `npx cap sync ios` keeps it in step with your web build.
- `npm run build` → `dist/` → `npx cap sync ios` → `ios/App/App/public/` → the app.
