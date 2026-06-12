# App Privacy Disclosures — App Store Connect "Nutrition Label" Answers

_Use this when filling out **App Store Connect → App Privacy**. Apple asks, for each data type, whether you collect it, whether it's **linked to the user's identity**, whether it's used to **track** them, and the **purposes**. Below are the recommended answers based on Eura's actual data flows. Update if you add SDKs (analytics, ads, crash reporting) later._

## Top-level answers

- **Do you or your third-party partners collect data from this app?** → **Yes.**
- **Do you use data to track users** (link with third-party data for advertising/measurement, or share with data brokers)? → **No.** → Your label shows **"Data Not Used to Track You."**

> Note: Apple requires you to disclose data collected by **third-party code/services** in your app too. OpenAI, Supabase, AWS, and Resend act as **service providers** processing data to provide your app — they are not "tracking" and not data brokers, so they don't change the "No tracking" answer, but the data they handle is reflected in the data types below.

---

## Data types to declare as **Collected**

### 1. Contact Info → Email Address
- **Collected:** Yes
- **Linked to the user's identity:** Yes
- **Used for tracking:** No
- **Purposes:** App Functionality (account creation/sign-in), and—for the confirmation/reset emails—you may also check App Functionality. (Not Marketing.)

### 2. User Content → Other User Content
_(Covers the drawings/strokes, canvas & folder names, thumbnails, and AI chat messages.)_
- **Collected:** Yes
- **Linked to the user's identity:** Yes
- **Used for tracking:** No
- **Purposes:** App Functionality.

> If Apple's flow surfaces "Photos or Videos" or "Audio Data," leave those **No** — you capture freehand vector strokes and rendered thumbnails, not the photo library, camera, or microphone. Thumbnails are app-generated images of the user's own work and fall under "Other User Content."

### 3. Identifiers → User ID
- **Collected:** Yes
- **Linked to the user's identity:** Yes
- **Used for tracking:** No
- **Purposes:** App Functionality.

> Do **not** declare "Device ID" or "Advertising Identifier" — you don't use IDFA or device advertising identifiers.

### 4. Diagnostics → Crash Data / Performance Data — _only if applicable_
- **Currently: No**, unless you add a crash-reporting/analytics SDK.
- If you later add one (e.g., Sentry, Firebase), come back and set the relevant Diagnostics/Usage types to **Yes**, **Not linked** (typically), **No tracking**, purpose **App Functionality / Analytics**.

---

## Data types to declare as **NOT Collected**

Leave all of these set to **No** (true for the current build):

- Financial Info, Health & Fitness, Location (precise or coarse), Sensitive Info,
- Contacts, Browsing History, Search History,
- Usage Data → Advertising Data / Product Interaction _(unless you add analytics)_,
- Identifiers → Advertising Identifier / Device ID,
- Photos/Videos, Audio Data, Gameplay Content, Customer Support _(unless you build in-app support tickets)_,
- Purchases _(none yet)_.

---

## Quick-reference summary

| Data type | Collected | Linked | Tracking | Purpose |
|---|---|---|---|---|
| Email Address | Yes | Yes | No | App Functionality |
| Other User Content (drawings, chat) | Yes | Yes | No | App Functionality |
| User ID | Yes | Yes | No | App Functionality |
| Everything else | No | — | — | — |

**Resulting label highlights:** "Data Linked to You" = Contact Info, User Content, Identifiers. "Data Not Used to Track You." No "Data Used to Track You" section.

---

## Also remember in App Store Connect

- **Privacy Policy URL** (App Information): paste the hosted URL of `privacy-policy.html`.
- **Privacy Choices URL** (optional): a page where users can manage/delete data — your in-app deletion satisfies the requirement; you can also point to the policy's "Your rights" section.
- **Privacy manifest** (`PrivacyInfo.xcprivacy`) in the iOS build must align with these declarations and list any required-reason APIs used by Capacitor/plugins.
