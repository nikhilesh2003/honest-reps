# Honest Reps — Flutter Mobile App (Android & iOS)

This folder is kept **separate** from the Next.js web application at the repository root.
It uses Flutter's native `HapticFeedback` API (`lib/services/haptics.dart`), which triggers real **iOS Taptic Engine** and **Android** vibration hardware without browser restrictions.

## Build Android & iOS via GitHub Actions (No Mac or Local Flutter Needed)

1. Push this repo to GitHub.
2. Open **Actions → Build Flutter Android & iOS** (runs automatically when `flutter_app/` changes, or click **Run workflow**).
3. Download the artifacts:
   - **Android:** `honest-reps-android-apk` (`app-release.apk`) — tap to install on Android.
   - **iOS:** `honest-reps-ios-ipa` (`honest-reps-ios-unsigned.ipa`) — sideload onto your iPhone from Windows using **Sideloadly** or **AltStore** (free Apple ID), or add Apple signing credentials to upload to **TestFlight**.
4. Set the download URLs in root `.env.local` so they appear under **Profile → Mobile App (Testing)** on the website:
   ```env
   NEXT_PUBLIC_ANDROID_APP_URL=https://your-download-link/app-release.apk
   NEXT_PUBLIC_IOS_APP_URL=https://your-testflight-or-ipa-link
   ```
