# Android installation and signing

## 2.2.8 installation failure

The source at `v2.2.7` configured a fixed signing key for
`com.nexus.chatstudio`. In `v2.2.8`, the release workflow falls back to
`assembleDebug` when signing secrets are absent, but still packages the app as
`com.nexus.chatstudio` and names it `Eva-android.apk`.

Debug keys generated on fresh CI runners differ from that older release key.
Android refuses an in-place update signed by an unrelated certificate. The
installer commonly displays **App not installed**; ADB reports
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. This explains an update failure while
2.2.7 is still installed; it is not an Android 16 incompatibility.

The downloaded APK hashes match GitHub's published asset digests. The 2.2.7
APK contains the Nexus certificate with SHA-256
`5d1c55632b6970d0997aac23f380fa20de8fe5a46bb32605c20eb3b9ecdf76ae`.
The [2.2.8 Android build log](https://github.com/AmanicX/nexus-testing/actions/runs/44901279191)
confirms missing signing secrets, debug fallback, successful v2 signature
verification, and the Android Debug certificate with SHA-256
`6e117ca652bbdcb8397de043bcebddbe97a45af4c54ea4b008df12a6d4a079e9`.
These certificates are different, and the APK has no v3 rotation proof.
The device's exact ADB error has not been captured.

## Safe testing installation

- Debug builds now use `com.nexus.chatstudio.testing`, with the launcher name
  **Eva Testing** and filename `Eva-android-testing.apk`.
- Install it alongside your existing EVA. It does not read, replace, or
  automatically migrate the original app's chats or settings.
- If needed, export a local backup from EVA and import it into Eva Testing.
- Temporary debug certificates can still differ between CI runs. For reliable
  updates, configure persistent signing secrets rather than regenerating keys.
  If a later testing build cannot update an older **Eva Testing**, export its
  data before uninstalling that testing app. Leave the original EVA installed.

The workflow only permits a debug fallback in `AmanicX/nexus-testing` when
**all four** release signing secrets are absent. Other repositories or partial
signing configurations fail instead of silently changing the signing identity.

## Production updates

Keep the same private signing key in encrypted repository secrets:
`ANDROID_KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
The production application ID remains `com.nexus.chatstudio`.

Merely creating a new key does **not** make it compatible with existing installs.
The historical key is documented as compromised in [KEY_ROTATION.md](KEY_ROTATION.md);
do not restore its embedded credentials or reuse it for ordinary signing.
Migrating existing users requires a reviewed signing-key rotation/lineage or
a local-backup/export and reinstall migration. Never uninstall before saving
and checking the backup.

## Diagnostic commands

```bash
# Check APK integrity and compare the certificate SHA-256 digests of both versions.
apksigner verify --verbose --print-certs Eva-2.2.7.apk
apksigner verify --verbose --print-certs Eva-2.2.8.apk

# With USB debugging enabled, capture Android's exact installation error.
# This attempts an update without uninstalling the existing app.
adb install -r Eva-2.2.8.apk
```

Publication now requires successful signature verification and the correct
application ID. The selected build variant is explicit; collection never falls
back to an arbitrary APK. Published APKs also include a SHA-256 checksum file.
