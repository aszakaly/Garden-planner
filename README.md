# Kerttervező (Garden planner)

Kert- és veteményes-tervező és kertészeti napló saját használatra. Magyar felület, Apple Emlékeztetők stílusban, helyi szerverrel; az otthoni Wi-Fi-n telefonról is használható, és főképernyőre téve alkalmazásként nyílik.

> **Fejlesztés alatt.** Az első teljes változat (MVP) elkészült; a terv: [docs/specs/2026-09-30-kerttervezo-design.md](docs/specs/2026-09-30-kerttervezo-design.md).

## Mit tud

- **Törzsadatok:** kb. 55 gyakori zöldség-, fűszer- és kísérőnövény magyar vetési naptárral, több szezonnal, fajtákkal és társítási adatokkal.
- **Vetőmagkészlet:** eredet, évjárat, készlet, csírázóképesség figyelése.
- **Kert és ágyások:** méretek, adottságok.
- **Éves terv:** ültetések sávos elhelyezéssel, dátumszámítással, újravetés-sorozatokkal, ágyás-idővonallal.
- **Ellenőrzések:** vetésforgó (család, tápanyagigény, vetésforgó-szakasz) és társítás, a múltbeli évek gyors rögzítésével.
- **Feladatok és naptár:** a tervből generált teendők, „Ez a hét” és havi lista, havi és éves naptár.
- **Tény és napló:** tényleges dátumok és hely, szezonvégi értékelés, kereshető napló, fajtaszintű tudásbázis.
- **Következő év:** tervév állapottal és jegyzettel, az évelők átvitele, és „Mi kerülhet ide?” javaslatok ágyásonként – a vetésforgó, a szomszédok, a vetőmagkészlet és a korábbi értékelések alapján.
- **Mentés:** automatikus és kézi mentés, JSON export és visszatöltés.

## Indítás

Node.js 24 vagy újabb kell (a beépített `node:sqlite` miatt), pl. `brew install node`.

**Dupla kattintással:** a projektmappában a `Kerttervező.command` fájl. Első indításkor telepíti a csomagokat, lefordítja a felületet, elindítja a szervert, és megnyitja a böngészőt (http://localhost:4321). A Terminál-ablak nyitva marad: amíg fut, a program elérhető; leállítás Ctrl+C-vel vagy az ablak bezárásával.

> Ha a macOS első alkalommal nem engedi megnyitni („nem ellenőrizhető fejlesztő”), kattints rá jobb gombbal → Megnyitás, és erősítsd meg. Ezt csak egyszer kell.

**Terminálból:**

```bash
npm install
npm start
```

## Telefonról

A szerver az otthoni hálózaton is elérhető. Indításkor kiírja a pontos címet, valahogy így:

```text
🌱 Kerttervező fut
   Ezen a gépen:   http://localhost:4321
   Otthoni hálón:  http://<gépnév>.local:4321  (192.168.1.x)
```

Nyisd meg az „Otthoni hálón” címet az iPhone Safarijában (ugyanazon a Wi-Fi-n), majd **Megosztás → Főképernyőhöz adás**. Innentől saját ikonnal, teljes képernyős alkalmazásként nyílik. Csak akkor működik, ha a Mac be van kapcsolva és a Kerttervező fut rajta. Hitelesítés nincs, ezért csak megbízható otthoni hálózaton használd.

## Mentés és visszaállítás

Az összes adat egyetlen fájlban van: `data/garden.db` (a git nem követi).

- **Automatikus mentés:** induláskor (legfeljebb 6 óránként) másolat készül a `data/backups/` mappába, pl. `garden-20261001-091500.db`. Az utolsó 30 marad meg.
- **Kézi mentés:** Beállítások → Mentés és adatok → *Mentés most*.
- **JSON export:** Beállítások → *Exportálás JSON-fájlba*. Az összes adatot (növények, ágyások, tervek, napló, beállítások) egy olvasható fájlba írja – ezzel viheted át másik gépre.
- **Visszatöltés JSON-ból:** Beállítások → *Visszatöltés JSON-fájlból…*. Minden jelenlegi adatot lecserél a fájl tartalmára; előtte automatikusan mentés készül, így egy rossz fájl sem visz el semmit.

Egy automatikus (`.db`) mentés visszaállítása kézzel:

1. Állítsd le a Kerttervezőt (Ctrl+C a Terminálban).
2. Nevezd át a jelenlegi `data/garden.db`-t (pl. `garden-regi.db`-re), és töröld mellőle a `garden.db-wal` és `garden.db-shm` fájlokat, ha vannak.
3. Másold a kiválasztott mentést `data/garden.db` néven a helyére, például:

   ```bash
   cp data/backups/garden-20261001-091500.db data/garden.db
   ```

4. Indítsd újra.

## Fejlesztés

```bash
npm run dev          # fejlesztői mód: felület http://localhost:5173, API a 4321-es porton
npm run dev:sandbox  # homokozó külön adatbázissal (data/sandbox.db): felület :5180, API :4331
npm test             # egység- és API-tesztek (Vitest)
npm run test:e2e     # végponttól végpontig tartó teszt (Playwright, saját átmeneti adatbázissal)
npm run typecheck
```

A homokozóban nyugodtan lehet kísérletezni: a saját adatbázisát használja, a valódi `data/garden.db`-hez nem nyúl.

### Felépítés

- `src/shared/` – típusok, zod sémák és a tiszta domain-logika (dátumok, geometria, vetésforgó, társítás, feladatok, javaslatok), egységtesztekkel.
- `src/server/` – Fastify REST API és SQLite (`node:sqlite`), kézi SQL-migrációkkal.
- `src/client/` – React, Vite, React Router, TanStack Query.
- `seed/` – az előtöltött növény- és társítási adatok.
- `e2e/` – Playwright-teszt a teljes tervezési folyamatra.

## Adatforrás

A társítási adatok (`seed/companions.json`) a [Wind River Greens Plant Variety Database](https://plants.windrivergreens.com) ([bripatch/plant-variety-database](https://github.com/bripatch/plant-variety-database)) adatain alapulnak, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) licenc alatt. Az eredeti, fajtaszintű angol adatokat faj szintre vontuk össze, és az indoklásokat magyarra fordítottuk; a feldolgozást a [scripts/build-companions.ts](scripts/build-companions.ts) végzi.

A vetési időpontok általános magyar vetési naptárértékek, ellenőrzésre szorulnak.

## Licenc

A kód [MIT licenc](LICENSE) alatt használható. A `seed/companions.json` társítási adatai a forrásuk CC BY 4.0 licence alá tartoznak (lásd fent).
