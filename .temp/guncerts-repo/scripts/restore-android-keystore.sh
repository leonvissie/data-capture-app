#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GLOBAL_GRADLE_PROPS="${GLOBAL_GRADLE_PROPS:-$HOME/.gradle/gradle.properties}"

read_gradle_prop() {
  key="$1"
  if [ ! -f "$GLOBAL_GRADLE_PROPS" ]; then
    return 1
  fi
  # Keep parsing simple: first matching key=value line wins.
  value="$(grep -E "^${key}=" "$GLOBAL_GRADLE_PROPS" | head -n 1 | cut -d'=' -f2- || true)"
  if [ -z "$value" ]; then
    return 1
  fi
  printf '%s' "$value"
  return 0
}

KEYSTORE_SRC="${KEYSTORE_SRC:-${ANDROID_KEYSTORE_PATH:-}}"
if [ -z "$KEYSTORE_SRC" ]; then
  KEYSTORE_SRC="$(read_gradle_prop "ANDROID_KEYSTORE_PATH" || true)"
fi
if [ -z "$KEYSTORE_SRC" ]; then
  KEYSTORE_SRC="$ROOT_DIR/keystore/release.keystore"
fi

KEYSTORE_DST="$ROOT_DIR/android/release.keystore"
PROPS_DST="$ROOT_DIR/android/keystore.properties"

ANDROID_KEY_ALIAS_VAL="${ANDROID_KEY_ALIAS:-$(read_gradle_prop "ANDROID_KEY_ALIAS" || true)}"
ANDROID_KEYSTORE_PASSWORD_VAL="${ANDROID_KEYSTORE_PASSWORD:-$(read_gradle_prop "ANDROID_KEYSTORE_PASSWORD" || true)}"
ANDROID_KEY_PASSWORD_VAL="${ANDROID_KEY_PASSWORD:-$(read_gradle_prop "ANDROID_KEY_PASSWORD" || true)}"

if [ ! -f "$KEYSTORE_SRC" ]; then
  echo "Missing keystore at $KEYSTORE_SRC"
  exit 1
fi

if [ -z "$ANDROID_KEYSTORE_PASSWORD_VAL" ] || [ -z "$ANDROID_KEY_ALIAS_VAL" ] || [ -z "$ANDROID_KEY_PASSWORD_VAL" ]; then
  echo "Missing signing credentials. Set env vars OR ~/.gradle/gradle.properties keys:"
  echo "ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD"
  exit 1
fi

cp "$KEYSTORE_SRC" "$KEYSTORE_DST"

cat > "$PROPS_DST" <<EOF
storeFile=../release.keystore
keyAlias=${ANDROID_KEY_ALIAS_VAL}
storePassword=${ANDROID_KEYSTORE_PASSWORD_VAL}
keyPassword=${ANDROID_KEY_PASSWORD_VAL}
EOF

echo "Restored keystore to $KEYSTORE_DST and wrote $PROPS_DST"
