# Kerttervező (Garden planner)

Kert- és veteményes-tervező és kertészeti napló saját használatra. Magyar felület, Apple Emlékeztetők stílusban, helyi szerverrel; az otthoni Wi-Fi-n telefonról is használható.

> **Fejlesztés alatt.** A tervezett lépések nagy része kész, a következő év tervezése, az export/import és a telepíthető (PWA) változat még hátravan. A részletes terv: [docs/specs/2026-09-30-kerttervezo-design.md](docs/specs/2026-09-30-kerttervezo-design.md).

## Mit tud

- **Törzsadatok:** kb. 55 gyakori zöldség-, fűszer- és kísérőnövény magyar vetési naptárral, több szezonnal, fajtákkal és társítási adatokkal.
- **Vetőmagkészlet:** eredet, évjárat, készlet, csírázóképesség figyelése.
- **Kert és ágyások:** méretek, adottságok.
- **Éves terv:** ültetések sávos elhelyezéssel, dátumszámítással, újravetés-sorozatokkal, ágyás-idővonallal.
- **Ellenőrzések:** vetésforgó (család, tápanyagigény, vetésforgó-szakasz) és társítás, a múltbeli évek gyors rögzítésével.
- **Feladatok és naptár:** a tervből generált teendők, „Ez a hét” és havi lista, havi és éves naptár.
- **Tény és napló:** tényleges dátumok és hely, szezonvégi értékelés, kereshető napló, fajtaszintű tudásbázis.

## Indítás

Node.js 24 vagy újabb kell (a beépített `node:sqlite` miatt).

```bash
npm install
npm run dev
```

Fejlesztői módban a felület a http://localhost:5173 címen érhető el, az API a 4321-es porton fut. Az adatok a `data/garden.db` fájlban vannak; induláskor (legfeljebb 6 óránként) automatikus másolat készül a `data/backups/` mappába.

```bash
npm start      # lefordítja a klienst, és mindent a 4321-es porton szolgál ki
npm test       # egység- és API-tesztek (Vitest)
```

## Felépítés

- `src/shared/` – típusok, zod sémák és a tiszta domain-logika (dátumok, geometria, vetésforgó, társítás, feladatok), egységtesztekkel.
- `src/server/` – Fastify REST API és SQLite (`node:sqlite`), kézi SQL-migrációkkal.
- `src/client/` – React, Vite, React Router, TanStack Query.
- `seed/` – az előtöltött növény- és társítási adatok.

## Adatforrás

A társítási adatok (`seed/companions.json`) a [Wind River Greens Plant Variety Database](https://plants.windrivergreens.com) ([bripatch/plant-variety-database](https://github.com/bripatch/plant-variety-database)) adatain alapulnak, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) licenc alatt. Az eredeti, fajtaszintű angol adatokat faj szintre vontuk össze, és az indoklásokat magyarra fordítottuk; a feldolgozást a [scripts/build-companions.ts](scripts/build-companions.ts) végzi.

A vetési időpontok általános magyar vetési naptárértékek, ellenőrzésre szorulnak.
