# Platofy for Android

A Trusted Web Activity: the app opens https://platofy.app full screen in Chrome's engine, so every
web release is instantly in the app too. Web push notifications show as Platofy notifications.

## Build

GitHub Actions (`.github/workflows/android.yml`) builds on every change under `apps/android/` and on
"Run workflow". It publishes a release with:

- `platofy.apk` — install directly on a phone:
  https://github.com/owo-crm/gastrowo/releases/latest/download/platofy.apk
- `platofy.aab` — for Google Play, if we publish there later

## Signing

The repository is public, so the key is never committed. The `ANDROID_SIGNING_KEY` Actions secret
holds `<password>:<base64 PKCS12 keystore>` with key alias `upload`. Keep an offline copy: an APK
signed with a different key can't update an installed app.

`apps/web/public/.well-known/assetlinks.json` lists the key's SHA-256 fingerprint. It proves to
Android that the app and platofy.app belong together; without it the app shows a browser address bar.
If the app goes to Google Play, add the Play app signing key's fingerprint there as well.
