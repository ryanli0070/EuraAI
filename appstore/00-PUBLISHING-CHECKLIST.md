# Publishing Eura on the Apple App Store — Requirements Checklist

_Last updated: June 11, 2026. This maps Apple's requirements to Eura's current state (per `HANDOFF.md`). The app is **Eura**; **Orion** is the in-app AI tutor. Items marked ✅ are already done in your repo; ❌ are still open._

This app ships as a **Capacitor-wrapped iOS app** (iPad-first), so it follows the **Apple App Store** process. There is no Google Play involvement unless you later add Android.

---

## 1. Apple Developer account & legal setup

- **Apple Developer Program membership** — $99/year. Required to submit at all. Enroll as an **Individual / Sole Proprietor** (matches your "me personally" choice). Apple will list your legal name as the seller.
- **Tax & banking** (only if charging money) — Paid Apps Agreement, bank + tax forms in App Store Connect. Free apps can skip this.
- **Certificates, App ID, and provisioning profile** — created in the Developer portal / Xcode for the bundle ID (e.g. `com.eura.app`).

## 2. The written/legal materials (what this folder covers)

- ✅/❌ **Privacy Policy at a public URL** — *required for every app.* → `01-PRIVACY-POLICY.md` + `privacy-policy.html` (host this and paste the URL into App Store Connect).
- **Terms of Use / EULA** — Apple supplies a [standard EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/) by default, but a custom one is recommended for an AI app. → `02-TERMS-OF-SERVICE.md` + `terms.html`.
- **App Privacy ("nutrition label") answers** — entered in App Store Connect; must disclose third-party services (OpenAI, Supabase). → `03-APP-PRIVACY-disclosures.md`.
- **Store listing copy** — name, subtitle, description, keywords, promo text, support URL. → `04-STORE-LISTING.md`.

## 3. Hard App Store blockers (from your §15-B)

- ✅ **In-app account deletion** (Guideline 5.1.1(v)) — built + verified (`DELETE /api/account`). _Apple has required this since 2022._
- ✅ **Custom SMTP** for auth emails — Resend, verified domain.
- ✅ **No "Sign in with Apple" needed** — email/password-only avoids the SIWA mandate.
- ❌ **App Privacy disclosures + privacy-policy URL** — fill in once the policy is hosted (this folder).
- ❌ **Age gate at signup (13+)** — you chose a 13+ minimum to avoid COPPA / Kids Category. Add a date-of-birth or 13+ confirmation at signup and reflect it in the policy + age rating. _This is the one new product change still to build._

## 4. Capacitor / technical submission requirements

- ❌ **Wrap in Capacitor + add iOS platform** (your §15-C) — `npx cap add ios`, `npx cap copy`.
- ❌ **Auth email deep links** return into the WKWebView (Capacitor URL scheme + Supabase redirect allowlist).
- ❌ **Move Supabase session off `localStorage`** to Capacitor secure storage before submission.
- ❌ **Apple Pencil** pressure/`pointerType` verified on a real iPad.
- ❌ **Build with the iOS/iPadOS 26 SDK or later** — *required for all uploads since April 28, 2026.* Use a current Xcode.
- **Privacy manifest (`PrivacyInfo.xcprivacy`)** — Apple requires a privacy manifest declaring data use and any "required-reason" APIs. Capacitor + its plugins should ship manifests; verify they're present in the iOS build.
- **App icon + launch screen** — 1024×1024 icon (no alpha), plus all required sizes (Capacitor `@capacitor/assets` generates these).
- **Screenshots** — required iPad screenshots (12.9" and/or 13" iPad Pro) for the listing.
- **TestFlight** — recommended for beta testing before public release.

## 5. App Review questionnaires (in App Store Connect)

- **Age rating questionnaire** — Apple's *updated* questionnaire (new 13+/16+/18+ tiers as of 2025–26) now asks specifically about **AI features/assistants**. Because Eura's tutor (Orion) uses GPT-4o, answer the AI question honestly; you can set a **13+ minimum** above whatever Apple assigns. _Responses were due by Jan 31, 2026 to avoid update interruptions._
- **Export compliance** — uses HTTPS/standard encryption only → typically "exempt."
- **Content rights** — confirm you have rights to all content.
- **Category** — "Education" (primary). Avoid the **Kids Category** on purpose (it forbids sending data to third parties like OpenAI).

## 6. Things to know about the AI + minors angle

Even at a **13+** minimum, you're handling minors' content and sending images of student work to **OpenAI**. Best practice (and reflected in the drafted policy):

- Use the **OpenAI API** (not consumer ChatGPT). API inputs are **not used to train OpenAI's models by default**, and OpenAI retains API data for a limited window for abuse monitoring — state this in the policy.
- Disclose OpenAI, Supabase, AWS, and Resend as **service providers / subprocessors**.
- Keep **no third-party advertising or analytics SDKs** — this keeps your App Privacy label clean ("Data Not Used to Track You") and avoids COPPA-style problems.

## 7. Disclaimer

These documents are practical drafts to get you through submission, not legal advice. For an app handling minors' data and AI, a brief review by a lawyer (especially the Privacy Policy and Terms) is worth it before launch.
