# Android Signing Key Remediation & Rotation Strategy

## 1. Overview & Security Assessment

The initial repository contained a committed keystore (`android/nexus-release.keystore`) and hardcoded fallback passwords in workflow and build configurations. In accordance with security best practices:
- **Status:** The old signing key is treated as **permanently compromised**.
- **Important Security Notice:** Deleting the key and passwords from the current files does **not** revoke the certificate nor remove it from Git history. Anyone with clone access to past commits can extract the private key.
- **Remediation in Code:** All embedded base64 keystores and password fallbacks have been eliminated from `release.yml`, `ci.yml`, and `build.gradle`. Production release signing strictly fails if required secrets are missing. Only `AmanicX/nexus-testing` permits an entirely unconfigured signing setup to produce a separately identified `Eva-android-testing.apk` (`com.nexus.chatstudio.testing`), never an update to production EVA.
- **Application ID:** Preserved as `com.nexus.chatstudio` to maintain application identity and ecosystem compatibility.

---

## 2. Certificate Identification

### Legacy (Compromised) Certificate
- **Distinguished Name:** `CN=Nexus, OU=Nexus, O=Nexus, L=Web, ST=Web, C=US`
- **Key Algorithm:** RSA 2048-bit
- **Serial Number:** `10593565129274090815`
- **SHA-256 Fingerprint:** `5D:1C:55:63:2B:69:70:D0:99:7A:AC:23:F3:80:FA:20:DE:8F:E5:A4:6B:B3:26:05:C2:0E:B3:B9:EC:DF:76:AE`
- **Validity:** 2026-10-17 to 2054-03-04 UTC

### New Production Certificate (Eva)
- **Distinguished Name:** `CN=Eva, OU=Eva Mobile, O=AmanicX, C=US`
- **Key Algorithm:** RSA 4096-bit (or EC P-256)
- **Key Alias:** `eva`
- **Storage:** Kept exclusively in GitHub Actions Encrypted Secrets (`ANDROID_KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`). Never committed to source control.

---

## 3. Operator Checklist: Determining Affected Published APKs

To audit which historical GitHub releases or distributed APKs were signed with the compromised identity:

1. **Download Published Release APKs:**
   Download the APK assets from GitHub Releases (e.g. `v1.0.0` through `v2.2.1`).

2. **Verify Signature Certificate Fingerprint:**
   Run `apksigner` on each downloaded APK:
   ```bash
   apksigner verify --verbose --print-certs Eva-android.apk
   ```
3. **Compare SHA-256 Fingerprint:**
   - If the certificate fingerprint matches `5D:1C:55:63:2B:69:70:D0:99:7A:AC:23:F3:80:FA:20:DE:8F:E5:A4:6B:B3:26:05:C2:0E:B3:B9:EC:DF:76:AE`, the APK was signed with the compromised legacy key.
   - Any APK signed with this key can theoretically be impersonated by an attacker who extracted the key from repository history.

4. **Operator Action Items (Pending Owner Action):**
   - [ ] **Generate Fresh Keystore:** Create a new production keystore offline using `keytool -genkeypair -v -keystore eva-release.keystore -alias eva -keyalg RSA -keysize 4096 -validity 10000`.
   - [ ] **Configure GitHub Secrets:** Add `ANDROID_KEYSTORE_BASE64` (base64-encoded keystore), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD` to GitHub repository secrets in `AmanicX/eva`.
   - [ ] **History Scrubbing (Optional / Disruptive):** If Git history must be purged of the compromised commit, run `git filter-repo` or BFG Repo-Cleaner across all branches and force-push. Note that this rewrites all commit SHAs and requires coordination with all contributors.


---

## 3. Key Rotation & APK Signature Scheme v3 Proof-of-Rotation

Android 9 (API level 28) and higher support **APK Signature Scheme v3**, which permits application signing key rotation with cryptographic proof:

1. **Rotation Lineage Generation:**
   Using Android's official `apksigner` tool:
   ```bash
   apksigner rotate \
     --out eva-lineage.bin \
     --old-signer --ks nexus-release.keystore --ks-key-alias nexus \
     --new-signer --ks eva-release.keystore --ks-key-alias eva
   ```

2. **Signing with Proof-of-Rotation:**
   When signing the release APK:
   ```bash
   apksigner sign \
     --ks eva-release.keystore \
     --ks-key-alias eva \
     --lineage eva-lineage.bin \
     --rotation-min-sdk 28 \
     Eva-android.apk
   ```

3. **Behavior Across Android Versions:**
   - **Android 9+ (API 28+):** The Android Package Manager validates that the new certificate was authorized by the old certificate via the cryptographically signed lineage. Existing installs update in-place without data loss.
   - **Android 8.1 and below (API <= 27):** Key rotation lineages are not supported by the OS Package Manager. Users must perform a manual migration.

---

## 4. User Migration & Recovery Instructions

For users running legacy Android or upgrading without signature lineage:
1. Open the existing Eva / Nexus app on Android.
2. Export a local backup JSON using the app's data-management settings. Cloud sync has been removed.
3. Confirm the backup is saved safely outside the app before uninstalling.
4. Uninstall the older APK.
5. Install the new release `Eva-android.apk`.
6. Import the saved local backup JSON using the app's data-management settings.
7. Check that your characters, conversations, messages, worlds, and preferences were restored.

---

## 5. Build Environment Enforcement

In `android/app/build.gradle`:
- `signingConfigs.debug` uses standard debug keys for local development.
- `signingConfigs.release` requires environment variables:
  - `ANDROID_KEYSTORE_PATH`
  - `KEYSTORE_PASSWORD`
  - `KEY_ALIAS`
  - `KEY_PASSWORD`
- If release signing variables are missing during release assembly, Gradle immediately aborts the build with `GradleException`. Hardcoded fallback passwords have been completely eradicated.
