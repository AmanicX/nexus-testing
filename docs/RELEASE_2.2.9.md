# 2.2.9 — Android installation testing

## Fixed

- Debug/test builds no longer reuse the installed production EVA's package ID.
  This avoids the signing-certificate conflict introduced by the 2.2.8 debug
  signing fallback.
- Invalid signatures, incorrect package IDs, and missing selected APK outputs
  now block publication instead of being ignored.
- Debug fallback is limited to `AmanicX/nexus-testing`, with a clearly named
  testing APK and SHA-256 checksum. Testing-repo releases are marked prerelease.

## Install on your phone

Download **Eva-android-testing.apk**. It appears as **Eva Testing** and installs
alongside your existing EVA; **do not uninstall 2.2.7**.

This is a separate test installation, not an in-place production update. Chats
and settings are not shared automatically. You can export a local backup from
the old app and import it into Eva Testing if desired.

Without persistent signing secrets, debug keys can change between CI runs.
Future testing releases may require exporting testing data and reinstalling
**Eva Testing**. Production updates need a consistent, securely managed signing
identity or a properly reviewed key-rotation migration.

## Verification

- 82 automated tests pass locally, including 14 Android packaging checks.
- Web/TypeScript build succeeds; lint has only existing unrelated warnings.
- The CI publication gate verifies the actual APK signature and package ID.
- Installation on the reported OnePlus 7T / crDroid Android 16 still needs
  owner verification after download.
