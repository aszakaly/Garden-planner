#!/bin/sh
# Egy mentés visszatöltése:  npm run zima:visszatoltes -- eles garden-20261121-113643.db
. "$(dirname "$0")/kozos.sh"
ssh "$ZIMA_HOST" sh -s -- visszatoltes "${1:-}" "${2:-}" < scripts/zima/szerver.sh
