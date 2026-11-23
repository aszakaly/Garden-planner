#!/bin/sh
# Egy mentés visszatöltése:  npm run zima:visszatoltes -- eles garden-20261121-113643.db
# vagy egy külső mentésből a lemezről:  npm run zima:visszatoltes -- eles napi/garden-20261123.db
. "$(dirname "$0")/kozos.sh"
ssh "$ZIMA_HOST" sh -s -- visszatoltes "${1:-}" "${2:-}" "${ZIMA_LEMEZ:-}" < scripts/zima/szerver.sh
