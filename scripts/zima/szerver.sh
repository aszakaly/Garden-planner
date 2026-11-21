# A szerveren fut (a kiadas.sh és az allapot.sh küldi át SSH-n); argumentumok: eles|teszt <verzió>, vagy allapot.
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

PELDANY="$1"
VERZIO="$2"
KONTENER="kerttervezo-$PELDANY-1"
VALTOZO=$([ "$PELDANY" = eles ] && echo ELES_VERZIO || echo TESZT_VERZIO)

# Élesre csak a teszten már kipróbált verzió mehet
if [ "$PELDANY" = eles ] && ! grep -qx "$VERZIO" teszt-elozmeny; then
  echo "A(z) $VERZIO még nem futott a teszten. Előbb: npm run kiadas:teszt -- $VERZIO" >&2
  exit 1
fi

echo "→ Letöltés: $IMAGE:$VERZIO"
docker pull -q "$IMAGE:$VERZIO" >/dev/null

# Kézi mentés a futó példányról a csere előtt (az indításkori migráció előtt amúgy is készül)
if docker inspect "$KONTENER" >/dev/null 2>&1 && [ "$(docker inspect -f '{{.State.Running}}' "$KONTENER")" = true ]; then
  mentes=$(docker exec "$KONTENER" node -e "fetch('http://localhost:4321/api/backups', { method: 'POST' }).then((r) => r.json()).then((j) => console.log(j.file ?? j.error))" || true)
  echo "→ Mentés a csere előtt: ${mentes:-nem sikerült}"
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
docker compose up -d --no-deps "$PELDANY" 2>&1 | grep -v '^ *$' || true

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

[ "$PELDANY" = teszt ] && { grep -qx "$VERZIO" teszt-elozmeny || echo "$VERZIO" >> teszt-elozmeny; }
echo "✓ $PELDANY: $VERZIO fut"
