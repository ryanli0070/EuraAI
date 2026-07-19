# App Review — replies for rejection (Submission 5c061ddd, v1.0 build 2)

Rejection date: June 25, 2026. Three items were raised. Paste the text below into the
Resolution Center reply in App Store Connect, and upload a new build (1.0 build 3) that
contains the icon + consent-dialog changes.

---

## 2.3.8 — Placeholder app icons  →  fixed in the build, no reply needed

The app icon was replaced with a finalized, full-bleed design (solid brand-orange
background, white Eura mark, 1024×1024, no transparency). Ships in build 3. No written
reply required — just resubmit with the new build. If you want to add a note:

> The app icon has been finalized. The new icon is a solid-color, full-bleed design that
> is consistent across all sizes and clearly represents the Eura brand.

---

## 2.1(b) — Information Needed (business model)

Paste verbatim into the Resolution Center:

> Thank you for the questions. Eura does not currently include any paid content,
> subscriptions, consumables, or unlockable features — the app is free for all users at
> this time. We may introduce paid features in the future, and any such purchases would be
> offered exclusively through Apple In-App Purchase.
>
> 1. Who are the users that will use the paid content in the app?
> There is no paid content in the app at this time. Eura is currently a free math-tutoring
> app for students, with every feature available to all users at no cost.
>
> 2. Where can users purchase the content that can be accessed in the app?
> There is nowhere to purchase content today. The app does not currently offer or link to
> any paid content, inside the app or externally.
>
> 3. What specific types of previously purchased content can a user access in the app?
> None at this time. The app currently has no concept of purchased content and no
> restore-purchase flow.
>
> 4. What paid content, subscriptions, or features are unlocked within the app that do
> not use In-App Purchase?
> None. The app currently has no paid tiers, subscriptions, or unlockable features through
> any payment method. The "Plan" screen is purely informational and shows the user is on
> the free plan (nothing to pay, no card on file). If we add paid features in the future,
> they will be sold exclusively through Apple In-App Purchase.
>
> 5. Do users have to pay a fee to create an account?
> No. Account creation and all app usage are currently free, and no card or payment
> information is collected.

---

## 5.1.1(i) & 5.1.2(i) — Third-party AI data sharing

Paste verbatim into the Resolution Center:

> The app uses OpenAI (the OpenAI API) to generate math-tutoring feedback. When a student
> requests feedback, the app sends an image of their handwritten canvas, its transcribed
> text, and their chat messages to OpenAI.
>
> Before any data is sent, the app now presents a consent dialog ("Share your work with
> Orion?") that (a) discloses exactly what is sent (the canvas image, transcribed text,
> and chat messages), (b) identifies OpenAI as the recipient, and (c) requires the user to
> tap "Allow" — nothing is transmitted otherwise. Consent is revocable at any time in
> Settings → Privacy ("AI feedback (OpenAI)"), and no data is sent while it is off.
>
> Our privacy policy (https://euralearn.com/privacy) identifies the data we collect, how
> it is collected, all uses of that data, and the OpenAI sub-processor, and confirms the
> protections that apply. This consent flow was added in the build now submitted for review.

### Also do in App Store Connect (required — in-app text alone is not enough)
- App Privacy → complete the data-collection questionnaire so the declared data types
  (account info, user content / handwriting + chat, diagnostics) match the privacy policy
  and the in-app disclosure. See `03-APP-PRIVACY-disclosures.md` for the mapping.

---

## Build / resubmit checklist
1. Bump version to 1.0 build **3** (Xcode target → General → Identity).
2. `cd frontend && npm run build && npx cap sync ios`
3. Open `frontend/ios/App/App.xcworkspace` in Xcode → Product → Archive → upload.
4. Select the new build in App Store Connect.
5. Post the two replies above in Resolution Center; confirm App Privacy labels are filled.
6. Submit for review.
