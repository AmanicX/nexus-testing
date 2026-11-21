#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root, after assembling the selected variant.
VARIANT="${1:-}"
case "$VARIANT" in
  release)
    EXPECTED_PACKAGE="com.nexus.chatstudio"
    ASSET_NAME="Eva-android.apk"
    ;;
  debug)
    EXPECTED_PACKAGE="com.nexus.chatstudio.testing"
    ASSET_NAME="Eva-android-testing.apk"
    ;;
  *)
    echo "Usage: bash scripts/collect-android-apk.sh release|debug" >&2
    exit 1
    ;;
esac

APK_FILE="android/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
if [ ! -s "$APK_FILE" ]; then
  echo "Missing APK for selected variant: $APK_FILE" >&2
  exit 1
fi

SDK_PATH="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
BUILD_TOOLS_DIR=$(find "${SDK_PATH:?Android SDK location is required}/build-tools" \
  -maxdepth 1 -mindepth 1 -type d | sort -V | tail -n 1)
if [ ! -x "$BUILD_TOOLS_DIR/apksigner" ] || [ ! -x "$BUILD_TOOLS_DIR/aapt" ]; then
  echo "Android apksigner and aapt are required before publishing an APK." >&2
  exit 1
fi

# Do not publish unsigned, damaged, or incorrectly identified APKs.
"$BUILD_TOOLS_DIR/apksigner" verify --verbose --print-certs "$APK_FILE"
BADGING=$("$BUILD_TOOLS_DIR/aapt" dump badging "$APK_FILE")
PACKAGE_ID=$(printf '%s\n' "$BADGING" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")
if [ "$PACKAGE_ID" != "$EXPECTED_PACKAGE" ]; then
  echo "Refusing to publish $VARIANT APK: expected $EXPECTED_PACKAGE, found $PACKAGE_ID." >&2
  exit 1
fi
if [ "$VARIANT" = "release" ] && grep -q '^application-debuggable' <<< "$BADGING"; then
  echo "Refusing to publish a debuggable APK as a production release." >&2
  exit 1
fi

mkdir -p out
cp "$APK_FILE" "out/$ASSET_NAME"
sha256sum "out/$ASSET_NAME" > "out/$ASSET_NAME.sha256"
echo "Verified $PACKAGE_ID: out/$ASSET_NAME"
