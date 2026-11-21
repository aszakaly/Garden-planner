# A kiadó parancsok közös része: a szerver címe a helyi, git alá nem kerülő scripts/zima/.zima fájlból.
# Tartalma egy sor, pl.: ZIMA_HOST=felhasznalo@192.168.1.50
set -eu
cd "$(dirname "$0")/../.."
if [ ! -f scripts/zima/.zima ]; then
  echo "Hiányzik a scripts/zima/.zima fájl. Hozd létre ezzel a sorral: ZIMA_HOST=felhasznalo@szerver-ip" >&2
  exit 1
fi
. scripts/zima/.zima
: "${ZIMA_HOST:?A scripts/zima/.zima fájlban add meg a ZIMA_HOST-ot}"
