#!/bin/sh
# Egy példány legutóbbi mentései:  npm run zima:mentesek -- eles
. "$(dirname "$0")/kozos.sh"
ssh "$ZIMA_HOST" sh -s -- mentesek "${1:-}" < scripts/zima/szerver.sh
