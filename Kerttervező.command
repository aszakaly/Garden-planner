#!/bin/zsh -l
# Kerttervező indítása: dupla kattintás a Finderben.
# Lefordítja a felületet, elindítja a szervert, és megnyitja a böngészőben.
# Leállítás: ebben az ablakban Ctrl+C (vagy az ablak bezárása).

cd "${0:A:h}" || exit 1
PORT="${KERT_PORT:-4321}"

# A Node.js a Homebrew vagy az nvm útvonaláról is jöhet
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "A Node.js nem található. Telepítsd (pl. brew install node), majd indítsd újra."
  read -k1 "?Nyomj meg egy billentyűt a bezáráshoz…"
  exit 1
fi

if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "A Kerttervező már fut – megnyitom a böngészőben."
  open "http://localhost:$PORT"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Első indítás: a szükséges csomagok telepítése…"
  npm install || { read -k1 "?Hiba történt. Nyomj meg egy billentyűt a bezáráshoz…"; exit 1; }
fi

# Ha a szerver válaszol, megnyitjuk a böngészőt (legfeljebb 2 percig várunk)
(
  for _ in {1..120}; do
    if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
      open "http://localhost:$PORT"
      exit 0
    fi
    sleep 1
  done
) &

npm start
