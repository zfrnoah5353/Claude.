#!/usr/bin/env bash
# Construit l'appli Android (dist/ReviseIA.apk) — marche en 4G sans le PC.
set -euo pipefail
cd "$(dirname "$0")/.."

npx esbuild standalone.js --bundle --platform=browser --format=iife --target=es2020 --minify --outfile=public/standalone.js
rm -rf www && cp -r public www
# Dans l'appli Android, on charge le moteur local avant l'interface
sed -i 's#<script src="/app.js"></script>#<script src="/standalone.js"></script>\n<script src="/app.js"></script>#' www/index.html

[ -d android ] || npx cap add android
npx cap sync android

M=android/app/src/main/AndroidManifest.xml
grep -q usesCleartextTraffic "$M" || sed -i 's#<application#<application android:usesCleartextTraffic="true"#' "$M"
grep -q android.permission.CAMERA "$M" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.CAMERA" />\n</manifest>#' "$M"

# Icône de l'appli
RES=android/app/src/main/res
rm -rf "$RES"/mipmap-anydpi-v26
for d in "$RES"/mipmap-*; do
  for f in ic_launcher.png ic_launcher_round.png ic_launcher_foreground.png; do
    [ -f "$d/$f" ] && cp public/icon-192.png "$d/$f"
  done
done

(cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon -q)
mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk dist/ReviseIA.apk
echo "OK : dist/ReviseIA.apk"
