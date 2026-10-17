#!/bin/sh
# Снимок стенда безголовым Chrome: scripts-dev/shot.sh <scene> <out.png> [ширина] [высота] [доп. параметры]
# Стенд должен быть запущен: python3 -m http.server 8766 --bind 127.0.0.1
SCENE="$1"; OUT="$2"; W="${3:-1440}"; H="${4:-900}"; EXTRA="$5"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size="$W,$H" --virtual-time-budget=6000 --screenshot="$OUT" \
  "http://127.0.0.1:8766/dev/harness/index.html?scene=$SCENE$EXTRA" >/dev/null 2>&1
echo "$OUT"
