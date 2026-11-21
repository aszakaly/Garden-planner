# A szerveren fut (a scripts/zima/*.sh küldi át SSH-n). Argumentumok:
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
touch .env teszt-elozmeny

if ! docker info >/dev/null 2>&1; then
  echo "A felhasználó nem kezelheti a Dockert. A ZimaOS webes termináljában futtasd: sudo usermod -aG docker $(id -un)" >&2
  exit 1
fi

allapot() {
  for p in eles teszt; do
    c="kerttervezo-$p-1"
    if docker inspect "$c" >/dev/null 2>&1; then
      kep=$(docker inspect -f '{{.Config.Image}}' "$c")
      all=$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c")
      echo "$p: ${kep##*:}  ($all)"
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
  KONTENER="kerttervezo-$PELDANY-1"
  if ! echo "$FAJL" | grep -Eqx 'garden-[0-9]{8}-[0-9]{6}\.db' || [ ! -f "$DIR/$PELDANY/backups/$FAJL" ]; then
    echo "Nincs ilyen mentés: $FAJL. A listához: npm run zima:mentesek -- $PELDANY" >&2
    exit 1
  fi
  if ! docker inspect "$KONTENER" >/dev/null 2>&1; then
    echo "A(z) $PELDANY példány még nem fut a szerveren, nincs mit visszatölteni. Előbb: npm run kiadas:$PELDANY -- <verzió>" >&2
    exit 1
  fi
  KEP=$(docker inspect -f '{{.Config.Image}}' "$KONTENER")
  docker stop "$KONTENER" >/dev/null
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
KONTENER="kerttervezo-$PELDANY-1"
VALTOZO=$([ "$PELDANY" = eles ] && echo ELES_VERZIO || echo TESZT_VERZIO)

echo "→ Letöltés: $IMAGE:$VERZIO"
if ! docker pull -q "$IMAGE:$VERZIO" >/dev/null 2>&1; then
  echo "✗ Nincs ilyen verzió: $VERZIO. Verzió a GitHubon egy vX.Y.Z kiadásból (Release) lesz, próba-image egy ág pusholásából (ag-<ágnév>). A futó példány nem változott." >&2
  exit 1
fi

# Kézi mentés a futó példányról a csere előtt (az indításkori migráció előtt amúgy is készül).
# Ha ugyanaz az image fut, nincs csere, és felesleges mentés sem kell (az utolsó 30 marad meg).
fut_image=$(docker inspect -f '{{.Image}}' "$KONTENER" 2>/dev/null || echo)
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
if [ "$fut_image" = "$uj_image" ] && [ "$(docker inspect -f '{{.State.Running}}' "$KONTENER")" = true ]; then
  echo "→ Ez a verzió fut már, nincs mit cserélni."
elif [ -n "$fut_image" ] && [ "$(docker inspect -f '{{.State.Running}}' "$KONTENER")" = true ]; then
  mentes=$(docker exec "$KONTENER" node -e "fetch('http://localhost:4321/api/backups', { method: 'POST' }).then((r) => r.json()).then((j) => console.log(j.file ?? j.error))" || true)
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

# A verzió beírása a .env-be, a másik példány sora változatlan marad
grep -v "^$VALTOZO=" .env > .env.uj || true
echo "$VALTOZO=$VERZIO" >> .env.uj
mv .env.uj .env
# Az első indításkor a másik példánynak is kell érték, különben a compose nem indul
grep -q '^ELES_VERZIO=' .env || echo "ELES_VERZIO=$VERZIO" >> .env
grep -q '^TESZT_VERZIO=' .env || echo "TESZT_VERZIO=$VERZIO" >> .env

echo "→ Indítás: $PELDANY"
if ! docker compose up -d --no-deps "$PELDANY"; then
  echo "✗ A(z) $PELDANY nem indítható (lásd fent). A .env már az új verziót tartalmazza; visszaálláshoz add ki az előzőt." >&2
  exit 1
fi

# Megvárjuk, amíg egészséges (legfeljebb 2 perc)
i=0
while [ $i -lt 60 ]; do
  h=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$KONTENER" 2>/dev/null || echo)
  [ "$h" = healthy ] && break
  if [ "$(docker inspect -f '{{.State.Restarting}}' "$KONTENER")" = true ] || [ "$h" = unhealthy ]; then
    i=60
    break
  fi
  sleep 2
  i=$((i + 1))
done
if [ "$h" != healthy ]; then
  echo "✗ A(z) $PELDANY nem indult el rendben. A napló vége:" >&2
  docker logs --tail 20 "$KONTENER" >&2
  exit 1
fi

if [ "$PELDANY" = teszt ] && ! grep -q "^$uj_image " teszt-elozmeny; then
  echo "$uj_image $VERZIO" >> teszt-elozmeny
fi
echo "✓ $PELDANY: $VERZIO fut"
