# A szerveren fut (a scripts/zima/*.sh küldi át SSH-n). A két példány ZimaOS-alkalmazás
# (kerttervezo-eles, kerttervezo-teszt): a casaos-cli telepíti és frissíti őket, így a
# ZimaOS kezdőlapján is látszanak. Argumentumok:
#   eles|teszt <verzió>             kiadás
#   allapot                         a két példány verziója és állapota
#   mentesek eles|teszt [lemez]               a legutóbbi mentések (az élesnél a lemezen lévő külsők is)
#   visszatoltes eles|teszt <fájl> [lemez]    egy mentés visszatöltése (a példány leállítva marad);
#                                             a fájl lehet napi/… vagy havi/… is a lemezen lévő külső mentésből
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
  KULSO_DIR="${3:-}/Kerttervezo-mentes"
  if [ "$2" = eles ] && [ -n "${3:-}" ] && [ -d "$KULSO_DIR/napi" ]; then
    echo
    echo "Külső mentések a lemezen (visszatöltéshez a teljes név kell, pl. napi/garden-20261123.db):"
    (cd "$KULSO_DIR" && ls -1r napi/ | head -10 | sed 's|^|napi/|'; ls -1r havi/ | sed 's|^|havi/|')
  fi
  exit 0
fi

if [ "$1" = visszatoltes ]; then
  PELDANY="$2"
  FAJL="${3:-}"
  KONTENER="kerttervezo-$PELDANY"
  # Forrás: a példány saját mentése, vagy (az élesnél) a lemezen lévő külső mentés
  if echo "$FAJL" | grep -Eqx '(napi/garden-[0-9]{8}|havi/garden-[0-9]{6})\.db' && [ "$PELDANY" = eles ] && [ -n "${4:-}" ]; then
    FORRAS_DIR="$4/Kerttervezo-mentes"
  else
    FORRAS_DIR="$DIR/$PELDANY/backups"
  fi
  if ! echo "$FAJL" | grep -Eqx 'garden-[0-9]{8}-[0-9]{6}\.db|napi/garden-[0-9]{8}\.db|havi/garden-[0-9]{6}\.db' || [ ! -f "$FORRAS_DIR/$FAJL" ]; then
    echo "Nincs ilyen mentés: $FAJL. A listához: npm run zima:mentesek -- $PELDANY" >&2
    exit 1
  fi
  if docker inspect "$KONTENER-1" >/dev/null 2>&1; then
    echo "A(z) $PELDANY még a régi módon fut. Előbb költöztesd át egy kiadással (npm run kiadas:$PELDANY -- <a futó verzió>), utána tölts vissza." >&2
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
  docker run --rm --user root -v "$DIR/$PELDANY:/data" -v "$FORRAS_DIR:/forras:ro" --entrypoint sh "$KEP" -c "
    set -e
    cd /data
    for k in '' -wal -shm; do if [ -f garden.db\$k ]; then mv garden.db\$k garden-visszatoltes-elott-$ido.db\$k; fi; done
    cp /forras/$FAJL garden.db
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

# A ZimaOS-leírás a verzióval (a kiadas.sh tölti fel a sablont); ha a leírás is változott
# (pl. ikon, port), azonos verziónál is frissíteni kell
LEMEZ="${3:-}"
DROPBOX="${4:-}"
for jel in LEMEZ DROPBOX; do
  if grep -q "__${jel}__" "zimaos-$PELDANY.sablon.yml" && [ -z "$(eval echo \$$jel)" ]; then
    echo "✗ A(z) $PELDANY leírása külső mentést használ, de a scripts/zima/.zima-ban nincs megadva a ZIMA_$jel." >&2
    exit 1
  fi
done
sed -e "s/__VERZIO__/$VERZIO/" -e "s|__LEMEZ__|$LEMEZ|" -e "s|__DROPBOX__|$DROPBOX|" "zimaos-$PELDANY.sablon.yml" > "zimaos-$PELDANY.uj.yml"

# A külső mentés célmappái: csak valóban csatolt lemezen/Dropboxon jön létre a mappa és a jelölőfájl,
# különben a konténer a csatolatlan pont alatti üres helyi mappába (az SSD-re) mentene
celok=$(sed -n 's|^ *KERT_KULSO_MENTES: *||p' "zimaos-$PELDANY.uj.yml" | tr ',' '\n' | sed 's|^[^=]*=||')
for alap in $LEMEZ $DROPBOX; do
  for cel in $(echo "$celok" | grep "^$alap/" || true); do
    if ! mountpoint -q "$alap"; then
      echo "⚠ A(z) $alap nincs csatolva: a(z) $cel cél most nem készül el, a Beállításokban hibaként látszik." >&2
      continue
    fi
    # Mappa és jelölőfájl a konténer jogaival: a konténer a saját felhasználójával (node, 1000) ír.
    # A Dropbox rclone-csatolásán a tulajdonos nem állítható, ott a chown hibája nem számít.
    docker run --rm --user root -v "$alap:/alap" --entrypoint sh "$IMAGE:$VERZIO" -c "
      set -e
      mkdir -p '/alap/${cel#"$alap"/}'
      touch '/alap/${cel#"$alap"/}/.kerttervezo-mentes-cel'
      chown -R node:node '/alap/${cel#"$alap"/}' 2>/dev/null || true"
  done
done
leiras_valtozott=true
cmp -s "zimaos-$PELDANY.uj.yml" "zimaos-$PELDANY.yml" 2>/dev/null && leiras_valtozott=false

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

if [ "$FUT" = "$KONTENER" ] && [ "$fut_image" = "$uj_image" ] && [ "$fut_megy" = true ] && [ "$leiras_valtozott" = false ]; then
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


if [ "$FUT" = "$REGI" ]; then
  # Átköltözés: a régi konténer helyére a ZimaOS-alkalmazás kerül, ugyanazzal az adatmappával
  echo "→ Átköltözés ZimaOS-alkalmazásba: a régi $REGI eltávolítása (az adatok maradnak)"
  docker stop "$REGI" >/dev/null
  docker rm "$REGI" >/dev/null
fi

# A csere előtti konténer azonosítója: frissítés után csak az új konténer egészsége számít
elotte_id=$(docker inspect -f '{{.Id}}' "$KONTENER" 2>/dev/null || echo)
if casaos-cli app-management list apps 2>/dev/null | grep -q "^$APP "; then
  if [ "$fut_image" = "$uj_image" ] && [ "$FUT" = "$KONTENER" ] && [ "$leiras_valtozott" = false ]; then
    # Indításnál ugyanaz a konténer marad
    elotte_id=""
    [ "$fut_megy" = true ] || { echo "→ Indítás: $PELDANY"; casaos-cli app-management start "$APP" >/dev/null; }
  else
    echo "→ Frissítés: $PELDANY"
    casaos-cli app-management apply "$APP" -f "zimaos-$PELDANY.uj.yml" >/dev/null
  fi
else
  echo "→ Telepítés ZimaOS-alkalmazásként: $APP"
  if ! casaos-cli app-management install -f "zimaos-$PELDANY.uj.yml" >/dev/null; then
    echo "✗ A ZimaOS nem tudta telepíteni a(z) $PELDANY példányt (lásd fent), most nem fut." >&2
    echo "  Az adatok megvannak ($DIR/$PELDANY). A hiba elhárítása után futtasd újra: npm run kiadas:$PELDANY -- $VERZIO" >&2
    exit 1
  fi
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
  most_id=$(docker inspect -f '{{.Id}}' "$KONTENER" 2>/dev/null || echo)
  if [ "${allas%% *}" = "$uj_image" ] && { [ -z "$elotte_id" ] || [ "$most_id" != "$elotte_id" ]; }; then
    h="${allas##* }"
    [ "$h" = healthy ] && break
    case "$allas" in *" true "* | *unhealthy) break ;; esac
  elif [ -n "$elotte_id" ] && [ "$most_id" = "$elotte_id" ] && [ $i -ge 10 ] && [ "${allas%% *}" = "$uj_image" ] && [ "${allas##* }" = healthy ]; then
    # 20 másodperc után is a régi, egészséges konténer fut: a ZimaOS szerint a változás nem kívánt újraindítást
    h=healthy
    break
  fi
  sleep 2
  i=$((i + 1))
done
if [ "$h" != healthy ]; then
  echo "✗ A(z) $PELDANY nem indult el rendben. A napló vége:" >&2
  docker logs --tail 20 "$KONTENER" >&2 || echo "  (a konténer nem jött létre; nézd meg a ZimaOS felületén)" >&2
  exit 1
fi

# A sikeresen alkalmazott leírás: a következő kiadás ehhez méri, változott-e
mv "zimaos-$PELDANY.uj.yml" "zimaos-$PELDANY.yml"
if [ "$PELDANY" = teszt ] && ! grep -q "^$uj_image " teszt-elozmeny; then
  echo "$uj_image $VERZIO" >> teszt-elozmeny
fi
echo "✓ $PELDANY: $VERZIO fut"
