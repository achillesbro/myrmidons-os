#!/bin/sh
# Regenerate the emblem's PNGs in public/brand/ from its SVGs, with headless Chrome
# (the site's renderer).   scripts/export-logo.sh [sizes...]   (default: 512 1024 2048)
#   myrmidons-logo.svg           raw gold bars, transparent — what the site renders; the FE
#                                styles it with brightness(2) + two --gold drop-shadows
#   myrmidons-logo-glow.svg      that filter baked in (glow scaled to the 320px pane), transparent
#   myrmidons-logo-glow-navy.svg same, on --bg-base navy (favicon uses its 512px PNG)
set -e
BRAND=$(cd "$(dirname "$0")/../public/brand" && pwd)
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
[ $# -gt 0 ] || set -- 512 1024 2048
for SIZE in "$@"; do
  for f in myrmidons-logo myrmidons-logo-glow myrmidons-logo-glow-navy; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      --default-background-color=00000000 --window-size="$SIZE,$SIZE" \
      --screenshot="$BRAND/$f-$SIZE.png" "file://$BRAND/$f.svg" >/dev/null 2>&1
    echo "public/brand/$f-$SIZE.png"
  done
done
