# Kerttervező (Garden planner)

Kert- és veteményes-tervező és kertészeti napló saját használatra. Magyar felület, Apple Emlékeztetők stílusban, helyi szerverrel; az otthoni Wi-Fi-n telefonról is használható, és főképernyőre téve alkalmazásként nyílik.

> **Fejlesztés alatt.** Az első teljes változat (MVP) elkészült; a terv: [docs/specs/2026-09-30-kerttervezo-design.md](docs/specs/2026-09-30-kerttervezo-design.md), a változások: [CHANGELOG.md](CHANGELOG.md).

## Mit tud

- **Törzsadatok:** kb. 55 gyakori zöldség-, fűszer- és kísérőnövény magyar vetési naptárral, több szezonnal, fajtákkal és társítási adatokkal.
- **Vetőmagkészlet:** eredet, évjárat, készlet, csírázóképesség figyelése.
- **Kert és ágyások:** méretek, adottságok; egy meglévő ágyás másolása mintaként, akár több egyforma ágyás egyszerre, sorszámozott névvel.
- **Éves terv:** ültetések sávos elhelyezéssel, dátumszámítással, újravetés-sorozatokkal, ágyás-idővonallal.
- **Ellenőrzések:** vetésforgó (család, tápanyagigény, vetésforgó-szakasz) és társítás, a múltbeli évek gyors rögzítésével.
- **Feladatok és naptár:** a tervből generált teendők, „Ez a hét” és havi lista, havi és éves naptár.
- **Tény és napló:** tényleges dátumok és hely, szezonvégi értékelés, kereshető napló, fajtaszintű tudásbázis.
- **Következő év:** tervév állapottal és jegyzettel, az évelők átvitele, és „Mi kerülhet ide?” javaslatok ágyásonként – a vetésforgó, a szomszédok, a vetőmagkészlet és a korábbi értékelések alapján.
- **Mentés:** automatikus és kézi mentés, JSON export és visszatöltés.
- **Súgó:** felhasználói kézikönyv az alkalmazásban (Adatok → Súgó), képernyőképekkel és egy 2,5 perces bemutatóvideóval.

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

## Futtatás a ZimaOS-szerveren

Az otthoni ZimaOS-szerveren két példány fut ugyanabból a Docker image-ből, saját adatbázissal:

| | Cím | Adatok a szerveren |
|---|---|---|
| **Éles** | `http://<szerver-ip>:4321` | `/DATA/AppData/kerttervezo/eles` |
| **Teszt** | `http://<szerver-ip>:4322` | `/DATA/AppData/kerttervezo/teszt` |

A teszten narancs „TESZT” csík jelzi a példányt; a Beállítások alján látszik a futó verzió. A ZimaOS kezdőlapján nem jelennek meg (azt csak a ZimaOS saját alkalmazáskezelője tölti fel): telefonon a Safariban **Megosztás → Főképernyőhöz adás**, mindkét címre külön.

**Első beállítás:** a szerver előkészítése (állandó cím, SSH, kulcs, Docker-jog) a [docs/zimaos-beallitas.md](docs/zimaos-beallitas.md) szerint. A szerver címét a Mac a `scripts/zima/.zima` fájlból olvassa (a git nem követi), pl. `ZIMA_HOST=felhasznalo@192.168.1.50`.

**Új verzió kiadása:**

1. A pull request összevonása után a GitHubon: **Releases → Draft a new release**, új címke `vX.Y.Z` a `main`-en. A GitHub Actions megépíti és kipróbálja a `ghcr.io/aszakaly/garden-planner:X.Y.Z` image-et (Actions fül, kb. 2 perc).
2. Teszt: `npm run kiadas:teszt -- X.Y.Z`, és kipróbálás telefonon.
3. Éles: `npm run kiadas:eles -- X.Y.Z`. Csak olyan verzió mehet ki, amely a teszten már futott.

Kiadáskor mentés készül a futó példányról, az új verzió pedig induláskor, a migrációk előtt is ment. Az adatbázis a szerver lemezén van, az image cseréje nem érinti. Egy ág minden pusholásából próba-image is készül (`ag-<ágnév>`), amely a merge előtt kirakható a tesztre.

```bash
npm run zima:allapot                       # melyik példány melyik verziót futtatja
npm run zima:mentesek -- eles              # a legutóbbi mentések
npm run zima:visszatoltes -- eles <fájl>   # egy mentés visszatöltése (a példány leállítva marad)
```

**Visszaállás az előző verzióra:** `npm run kiadas:eles -- <előző verzió>`. Ha az újabb verzió már átalakította az adatbázist (migráció), a régebbi nem indul el, és ezt jelzi; ilyenkor előbb a migráció előtti mentést kell visszatölteni (`zima:mentesek`, majd `zima:visszatoltes`), utána jöhet a kiadás. A visszatöltés előtti adatbázis `garden-visszatoltes-elott-<idő>.db` néven megmarad az adatmappában.

> A mentések ugyanazon a lemezen vannak, mint az adatbázis. Lemezhiba ellen érdemes a `/DATA/AppData/kerttervezo` mappát a ZimaOS mentésével máshová is menteni, vagy időnként JSON-exportot készíteni.

## Fejlesztés

```bash
npm run dev          # fejlesztői mód: felület http://localhost:5173, API a 4321-es porton
npm run dev:sandbox  # homokozó külön adatbázissal (data/sandbox.db): felület :5180, API :4331
npm test             # egység- és API-tesztek (Vitest)
npm run test:e2e     # végponttól végpontig tartó teszt (Playwright, saját átmeneti adatbázissal)
npm run typecheck
npm run sugo         # a Súgó képernyőképei a mintakertből (saját szerver :4361, data/sugo/)
npm run sugo:video   # a Súgó bemutatóvideója (ffmpeg kell: brew install ffmpeg)
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

A vetési, kiültetési és betakarítási időszakok általános magyar vetési naptárakból valók (kertvar.hu, agroinform.hu, kertlap.hu). A tő- és sortáv és a tenyészidő általános kertészeti alapérték, amelyet – ahol volt adat – összevetettünk a Rédei Kertimag tasakadataival (oazis.hu), az [origo.hu házikerti helyigény-táblázatával](https://www.origo.hu/attached/20130219helyigeny-zoldseg-fuszer.pdf) és a [kertforum.hu tenyészidő-táblázatával](https://www.kertforum.hu/tenyeszido-cop1/). Tájékoztató jellegűek: a fajták között nagy az eltérés, a vetőmag tasakján lévő értéket érdemes a fajtánál megadni.

A Súgó bemutatóvideójának zenéje (`scripts/sugo/zene/morning.mp3`): „Morning” – Kevin MacLeod ([incompetech.com](https://incompetech.com)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) licenc alatt.

## Licenc

A kód [MIT licenc](LICENSE) alatt használható. A `seed/companions.json` társítási adatai és a bemutatóvideó zenéje a forrásuk CC BY 4.0 licence alá tartoznak (lásd fent).

## Felelősségkizárás

A Kerttervező saját használatra készült prototípus, nem kereskedelmi termék. Aki mégis kipróbálja, a saját felelősségére teszi:

- **Ahogy van.** A program mindennemű garancia nélkül érhető el; nincs támogatás, és nincs ígéret a további fejlesztésre vagy a hibák javítására.
- **Biztonság.** Nincs benne felhasználókezelés és jelszó, otthoni, megbízható hálózatra készült. Ne tedd elérhetővé az internetről. Biztonsági hibák előfordulhatnak; az ezekből eredő károkért nem vállalok felelősséget.
- **Telepítés és adatok.** A telepítés és a futtatás a saját gépeden a te felelősséged. Az adatok elvesztéséért vagy sérüléséért nem vállalok felelősséget – készíts rendszeresen mentést (lásd [Mentés és visszaállítás](#mentés-és-visszaállítás)).
- **A kertészeti adatok pontossága.** A vetési időszakok, a tő- és sortáv, a tenyészidő, a társítási és vetésforgó-javaslatok általános, tájékoztató jellegű értékek, hibásak vagy hiányosak lehetnek, és nem helyettesítik a vetőmag tasakján lévő útmutatást, a helyi tapasztalatot vagy a szakember tanácsát. Az ezek alapján hozott döntések következményeiért (pl. terméskiesésért) nem vállalok felelősséget.

Jogi értelemben az [MIT licenc](LICENSE) szövege az irányadó; ez a rész csak közérthetően összefoglalja.

<details>
<summary>English summary</summary>

Kerttervező is a personal prototype, not a commercial product. It is provided "as is", without warranty of any kind and without support. It has no authentication and is meant for a trusted home network only – do not expose it to the internet. You install and run it at your own risk: the author accepts no liability for security issues, data loss, or the accuracy of the horticultural data (sowing times, spacing, growing periods, companion and rotation suggestions), which are general reference values only. The [MIT License](LICENSE) is the legally binding text.

</details>
