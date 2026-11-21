#!/bin/sh
# Új verzió kirakása a ZimaOS-szerverre.
#   npm run kiadas:teszt -- 1.1.0        (vagy egy ág próba-image-e: ag-<ágnév>)
#   npm run kiadas:eles -- 1.1.0         (csak olyan verzió, amely a teszten már futott)
. "$(dirname "$0")/kozos.sh"
PELDANY="${1:-}"
VERZIO="${2:-}"
case "$PELDANY" in eles | teszt) ;; *) echo "Használat: kiadas.sh eles|teszt <verzió>" >&2; exit 1 ;; esac
if [ -z "$VERZIO" ]; then
  echo "Add meg a verziót, pl.: npm run kiadas:$PELDANY -- 1.1.0" >&2
  exit 1
fi
VERZIO="${VERZIO#v}"
scp -q docker-compose.yml "$ZIMA_HOST:/DATA/AppData/kerttervezo/docker-compose.yml"
ssh "$ZIMA_HOST" sh -s -- "$PELDANY" "$VERZIO" < scripts/zima/szerver.sh
PORT=$([ "$PELDANY" = eles ] && echo 4321 || echo 4322)
echo "  Cím: http://${ZIMA_HOST#*@}:$PORT"
