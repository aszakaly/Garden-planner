#!/bin/sh
# Melyik példány melyik verziót futtatja, és egészséges-e.
. "$(dirname "$0")/kozos.sh"
ssh "$ZIMA_HOST" sh -s -- allapot < scripts/zima/szerver.sh
