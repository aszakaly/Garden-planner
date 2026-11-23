# A szerveren fut (a scripts/zima/*.sh küldi át SSH-n). A két példány ZimaOS-alkalmazás
# (kerttervezo-eles, kerttervezo-teszt): a casaos-cli telepíti és frissíti őket, így a
# ZimaOS kezdőlapján is látszanak. Argumentumok:
#   eles|teszt <verzió>             kiadás
#   allapot                         a két példány verziója és állapota
#   mentesek eles|teszt             a legutóbbi mentések
#   visszatoltes eles|teszt <fájl>  egy mentés visszatöltése (a példány leállítva marad)
set -eu
DIR=/DATA/AppData/kerttervezo
IMAGE=ghcr.io/aszakaly/garden-planner
# A felhasználó saját mappájában (/DATA) a ZimaOS Docker-beállítása van, azt nem olvashatjuk
export DOCKER_CONFIG="$DIR/.docker"
mkdir -p "$DOCKER_CONFIG" "$DIR/eles" "$DIR/teszt"
cd "$DIR"
touch teszt-elozmeny

if ! docker info >/dev/null 2>&1; then
  echo "A felhasználó nem kezelheti a Dockert. A ZimaOS webes termináljában futtasd: sudo usermod -aG docker $(id -un)" >&2
  exit 1
fi

allapot() {
  for p in eles teszt; do
    c="kerttervezo-$p"
    megj=""
    if ! docker inspect "$c" >/dev/null 2>&1 && docker inspect "$c-1" >/dev/null 2>&1; then
      c="$c-1"
      megj=", még nem ZimaOS-alkalmazás"
    fi
    if docker inspect "$c" >/dev/null 2>&1; then
      kep=$(docker inspect -f '{{.Config.Image}}' "$c")
      all=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c")
      echo "$p: ${kep##*:}  ($all$megj)"
    else
      echo "$p: nem fut"
    fi
  done
}

if [ "$1" = allapot ]; then
  allapot
  exit 0
fi

if [ "$1" = mentesek ] || [ "$1" = visszatoltes ]; then
  case "${2:-}" in eles | teszt) ;; *) echo "Add meg a példányt: eles vagy teszt" >&2; exit 1 ;; esac
fi

if [ "$1" = mentesek ]; then
  echo "A(z) $2 legutóbbi mentései (a legújabb elöl):"
  ls -1t "$DIR/$2/backups" | head -15
  exit 0
fi

if [ "$1" = visszatoltes ]; then
  PELDANY="$2"
  FAJL="${3:-}"
  KONTENER="kerttervezo-$PELDANY"
  if ! echo "$FAJL" | grep -Eqx 'garden-[0-9]{8}-[0-9]{6}\.db' || [ ! -f "$DIR/$PELDANY/backups/$FAJL" ]; then
    echo "Nincs ilyen mentés: $FAJL. A listához: npm run zima:mentesek -- $PELDANY" >&2
    exit 1
  fi
  if ! docker inspect "$KONTENER" >/dev/null 2>&1; then
    echo "A(z) $PELDANY példány még nem fut a szerveren, nincs mit visszatölteni. Előbb: npm run kiadas:$PELDANY -- <verzió>" >&2
    exit 1
  fi
  KEP=$(docker inspect -f '{{.Config.Image}}' "$KONTENER")
  casaos-cli app-management stop "$KONTENER" >/dev/null
  i=0
  while [ "$(docker inspect -f '{{.State.Running}}' "$KONTENER")" = true ] && [ $i -lt 30 ]; do sleep 2; i=$((i + 1)); done
  if [ "$(docker inspect -f '{{.State.Running}}' "$KONTENER")" = true ]; then
    echo "✗ A(z) $PELDANY nem állt le, a visszatöltés elmaradt." >&2
    exit 1
  fi
  ido=$(date +%Y%m%d-%H%M%S)
  # A jelenlegi adatbázis nem vész el: garden-visszatoltes-elott-<idő>.db néven marad az adatmappában
  docker run --rm --user root -v "$DIR/$PELDANY:/data" --entrypoint sh "$KEP" -c "
    set -e
    cd /data
    for k in '' -wal -shm; do if [ -f garden.db\$k ]; then mv garden.db\$k garden-visszatoltes-elott-$ido.db\$k; fi; done
    cp backups/$FAJL garden.db
    chown node:node garden.db"
  echo "✓ Visszatöltve: $FAJL. A korábbi adatbázis: $PELDANY/garden-visszatoltes-elott-$ido.db"
  echo "  A(z) $PELDANY most le van állítva. Indítsd el azzal a verzióval, amelyikkel a mentés készült:"
  echo "  npm run kiadas:$PELDANY -- <verzió>"
  exit 0
fi

PELDANY="$1"
VERZIO="$2"
APP="kerttervezo-$PELDANY"
KONTENER="$APP"
# A korábbi, docker compose-zal futtatott példány konténere (átköltözéskor eltávolítjuk)
REGI="kerttervezo-$PELDANY-1"

echo "→ Letöltés: $IMAGE:$VERZIO"
if ! docker pull -q "$IMAGE:$VERZIO" >/dev/null 2>&1; then
  echo "✗ Nincs ilyen verzió: $VERZIO. Verzió a GitHubon egy vX.Y.Z kiadásból (Release) lesz, próba-image egy ág pusholásából (ag-<ágnév>). A futó példány nem változott." >&2
  exit 1
fi
uj_image=$(docker image inspect -f '{{.Id}}' "$IMAGE:$VERZIO")

# Élesre csak a teszten már kipróbált image mehet. Az azonosítót nézzük, nem a nevet:
# egy ág próba-image-e (ag-<ágnév>) minden pusholáskor új tartalmat kap ugyanazon a néven.
if [ "$PELDANY" = eles ] && ! grep -q "^$uj_image " teszt-elozmeny; then
  if grep -q " $VERZIO\$" teszt-elozmeny; then
    echo "A(z) $VERZIO azóta megváltozott, hogy a teszten futott, ezért élesre nem rakható ki. Előbb: npm run kiadas:teszt -- $VERZIO" >&2
  else
    echo "A(z) $VERZIO még nem futott a teszten, ezért élesre nem rakható ki. Előbb: npm run kiadas:teszt -- $VERZIO" >&2
  fi
  exit 1
fi

# Melyik konténer fut most: a ZimaOS-alkalmazás vagy még a régi
FUT=""
docker inspect "$KONTENER" >/dev/null 2>&1 && FUT="$KONTENER"
[ -z "$FUT" ] && docker inspect "$REGI" >/dev/null 2>&1 && FUT="$REGI"
fut_image=""
fut_megy=false
if [ -n "$FUT" ]; then
  fut_image=$(docker inspect -f '{{.Image}}' "$FUT")
  fut_megy=$(docker inspect -f '{{.State.Running}}' "$FUT")
fi

if [ "$FUT" = "$KONTENER" ] && [ "$fut_image" = "$uj_image" ] && [ "$fut_megy" = true ]; then
  echo "→ Ez a verzió fut már, nincs mit cserélni."
elif [ "$fut_megy" = true ] && { [ "$fut_image" != "$uj_image" ] || [ "$FUT" = "$REGI" ]; }; then
  # Mentés a futó példányról a csere előtt (az indításkori migráció előtt amúgy is készül);
  # átköltözéskor akkor is, ha a verzió nem változik.
  mentes=$(docker exec "$FUT" node -e "fetch('http://localhost:4321/api/backups', { method: 'POST' }).then((r) => r.json()).then((j) => console.log(j.file ?? j.error))" || true)
  case "$mentes" in
    garden-*.db) echo "→ Mentés a csere előtt: $mentes" ;;
    *)
      echo "✗ A csere előtti mentés nem sikerült: ${mentes:-nincs válasz}" >&2
      if [ "$PELDANY" = eles ]; then
        echo "  Az éles példány nem változott. Nézd meg a szerver lemezét (megtelt?), és próbáld újra." >&2
        exit 1
      fi
      ;;
  esac
fi

# Az adatmappa a konténer felhasználójáé legyen (node, 1000)
docker run --rm --user root -v "$DIR/$PELDANY:/data" --entrypoint chown "$IMAGE:$VERZIO" -R node:node /data

# A ZimaOS-leírás a verzióval (a kiadas.sh tölti fel a sablont)
sed "s/__VERZIO__/$VERZIO/" "zimaos-$PELDANY.sablon.yml" > "zimaos-$PELDANY.yml"

if [ "$FUT" = "$REGI" ]; then
  # Átköltözés: a régi konténer helyére a ZimaOS-alkalmazás kerül, ugyanazzal az adatmappával
  echo "→ Átköltözés ZimaOS-alkalmazásba: a régi $REGI eltávolítása (az adatok maradnak)"
  docker stop "$REGI" >/dev/null
  docker rm "$REGI" >/dev/null
fi

if casaos-cli app-management list apps 2>/dev/null | grep -q "^$APP "; then
  if [ "$fut_image" = "$uj_image" ] && [ "$FUT" = "$KONTENER" ]; then
    [ "$fut_megy" = true ] || { echo "→ Indítás: $PELDANY"; casaos-cli app-management start "$APP" >/dev/null; }
  else
    echo "→ Frissítés: $PELDANY"
    casaos-cli app-management apply "$APP" -f "zimaos-$PELDANY.yml" >/dev/null
  fi
else
  echo "→ Telepítés ZimaOS-alkalmazásként: $APP"
  casaos-cli app-management install -f "zimaos-$PELDANY.yml" >/dev/null
fi

# A régi compose-os futtatás maradékai, ha már egyik példány sem úgy fut
if ! docker inspect kerttervezo-eles-1 >/dev/null 2>&1 && ! docker inspect kerttervezo-teszt-1 >/dev/null 2>&1; then
  rm -f .env docker-compose.yml
  docker network rm kerttervezo_default >/dev/null 2>&1 || true
fi

# A ZimaOS a háttérben cseréli a konténert: megvárjuk, amíg az új verzió egészséges (legfeljebb 3 perc)
i=0
h=""
while [ $i -lt 90 ]; do
  allas=$(docker inspect -f '{{.Image}} {{.State.Restarting}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$KONTENER" 2>/dev/null || echo)
  if [ "${allas%% *}" = "$uj_image" ]; then
    h="${allas##* }"
    [ "$h" = healthy ] && break
    case "$allas" in *" true "* | *unhealthy) break ;; esac
  fi
  sleep 2
  i=$((i + 1))
done
if [ "$h" != healthy ]; then
  echo "✗ A(z) $PELDANY nem indult el rendben. A napló vége:" >&2
  docker logs --tail 20 "$KONTENER" >&2 || echo "  (a konténer nem jött létre; nézd meg a ZimaOS felületén)" >&2
  exit 1
fi

if [ "$PELDANY" = teszt ] && ! grep -q "^$uj_image " teszt-elozmeny; then
  echo "$uj_image $VERZIO" >> teszt-elozmeny
fi
echo "✓ $PELDANY: $VERZIO fut"
