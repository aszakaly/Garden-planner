# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## A projekt

Kerttervező: saját használatú kert- és veteményes-tervező és kertészeti napló. Magyar felület Apple Emlékeztetők stílusban, helyi Node-szerverrel; telefonról az otthoni Wi-Fi-n érhető el (PWA). A termékdöntések forrása a [design dokumentum](docs/specs/2026-09-30-kerttervezo-design.md); az MVP utáni bővítések döntései a végén, a „Bővítések az MVP után” szakaszban vannak. A felületen látható változások a [CHANGELOG.md](CHANGELOG.md)-be kerülnek, dátum szerinti fejezetekbe.

Minden szöveg magyar: a felület, a hibaüzenetek (a szerver üzenetei közvetlenül megjelennek), a kódkommentek, a tesztnevek és a commitüzenetek is.

## Parancsok

Node.js 24+ kell (a beépített `node:sqlite` miatt).

```bash
npm run dev           # felület :5173, API :4321, data/garden.db
npm run dev:sandbox   # felület :5180, API :4331, data/sandbox.db
npm run dev:uitest    # felület :5190, API :4341, data/uitest.db
npm start             # build + éles mód: a Fastify szolgálja ki a dist/client-et is (:4321)
npm test              # Vitest: src/**/*.test.ts és tests/unit/**/*.test.ts
npx vitest run src/shared/domain/beds.test.ts   # egy tesztfájl
npx vitest run -t "sorszám"                     # tesztnév szerint
npm run test:e2e      # Playwright: buildel, saját szerver :4351-en, üres data/e2e/garden.db
npm run typecheck     # tsc --noEmit (külön linter nincs)
```

**Adatbiztonság:**
- A `data/garden.db` a felhasználó valódi adatbázisa, a `data/sandbox.db` a homokozója. Ezekbe soha ne írj tesztadatot.
- A felhasználó saját portjain (5173/4321, 5180/4331) ne indíts szervert.
- Saját kipróbáláshoz a `dev:uitest` példányt használd: a `.claude/launch.json`-ban `kerttervezo-uitest` néven, a `data/uitest.db` adatbázissal.
- Az e2e teszt mindig a `data/e2e/` mappát használja.

A szerver a `KERT_PORT` és a `KERT_DB` környezeti változóból olvassa a portot és az adatbázist. Indításkor automatikus mentést készít az adatbázis melletti `backups/` mappába (legfeljebb 6 óránként, az utolsó 30 marad meg).

Az e2e teszt alapból a gépre telepített Chrome-ot használja (`channel: 'chrome'`); `PW_CHANNEL=chromium` esetén a Playwright saját böngészőjét.

## Architektúra

Egyetlen TypeScript projekt három réteggel; a `@shared/*` alias a `src/shared`-re mutat (Vite és Vitest is).

### `src/shared/` – közös, tiszta logika

- **Tartalom:**
  - `types.ts`: típusok.
  - `schemas.ts`: zod bemeneti sémák. Ezekkel validál a szerver, és ezekből jönnek a kliens űrlaptípusai is.
  - `labels.ts`: az enum-értékek és a magyar feliratuk.
  - `text.ts`: magyar ragozási segédek, pl. `yearIn` („2025-ben”).
  - `domain/`: mellékhatás nélküli domain-logika, egységtesztekkel.
- **Közös használat:** a domain-logikát a kliens és a szerver ugyanúgy hívja. Például a `numberedNames`-t az ágyás-lap előnézete és a szerver tömeges ágyásfelvétele is használja.
- **Ellenőrzések:** a vetésforgó- és társítás-ellenőrzés a **kliensen** fut, a `features/plan/useChecks.ts` hívja a `domain/plantingChecks.ts`-t. Bemenete a kliensre letöltött ültetés-előzmény és a törzsadatok.
- **Feladatok:** a `domain/tasks.ts` determinisztikusan, stabil kulccsal generálja őket a tervből. Az adatbázisban csak az állapotuk van (`task_state`: elvégezve, áthelyezve); a saját feladatok külön táblában (`custom_task`).
- **Dátumok:** mindenhol `ÉÉÉÉ-HH-NN` szövegként. A vetési ablakok `HH-NN` formájúak, az évhatáron átnyúlóknál `year_offset`-tel.

### `src/server/` – Fastify + node:sqlite

- **Felépítés:**
  - `app.ts` a `buildApp`-ban regisztrálja a `routes/*.ts` gyárfüggvényeket (`(db) => plugin`) a `/api` előtag alá.
  - Az SQL a `repos/*.ts`-ben van, szinkron `DatabaseSync`-kel.
  - Éles módban a `clientDir` statikus kiszolgálás, SPA-visszaeséssel az `index.html`-re.
- **Hibakezelés:**
  - A route-ok a `séma.parse(req.body)` hívással validálnak; a `ZodError` automatikusan 400-as választ ad, `issues` listával.
  - Más hibakódhoz `HttpError(status, magyar üzenet)`, a `db/helpers.ts`-ből.
- **Segédfüggvények (`db/helpers.ts`, `db/index.ts`):**
  - Az `insert`/`update` objektumból épít SQL-t. Az `update` kihagyja az `undefined` mezőket, ezért a teljes cserét végző PUT-nál a hiányzó opcionális mezőket kifejezetten `null`-ra kell állítani; minta: `updateBed`.
  - A `transaction()` (`db/index.ts`) nem ágyazható egymásba.
- **Migrációk:**
  - Számozott SQL-fájlok a `db/migrations/`-ben, induláskor sorban futnak le. Mindegyik külön tranzakcióban fut, kikapcsolt idegenkulcs-ellenőrzéssel, utána `foreign_key_check` jön, így a táblák újraépítése is megengedett.
  - A seed csak üres adatbázisra fut (`seedIfEmpty`), ezért a seed-adatok változását a meglévő adatbázisokba migrációval kell átvinni; minta: `004_plant_source.sql`.
- **JSON export/import (`db/exchange.ts`):**
  - Új táblát fel kell venni az `EXPORT_TABLES`-be, függőségi sorrendben.
  - Az export a legutóbbi migráció fájlnevét írja be `schema`-ként. Újabb sémájú fájl nem tölthető be; régebbinél a hiányzó oszlopok alapértéket kapnak.
  - A visszatöltés teljes csere, és újraépíti a `journal_fts` indexet is.
- **API-tesztek:** `openDatabase(':memory:')` + `seedIfEmpty` + `buildApp({ db })`, majd `app.inject(...)`.

### `src/client/` – React 19 + Vite + React Router + TanStack Query

- **Útvonalak:** az `App.tsx`-ben, magyar elérési utakkal (`/het`, `/terv`, `/agyas/:id`, `/novenyek`, `/kert`, `/beallitasok` …). A funkciók a `features/<terület>/` mappákban vannak.
- **Lekérdezések** (`lib/queries.ts`):
  - Minden kulcs a `qk` objektumban van, és **hierarchikus**: a feladatok, az előzmények és az átvitel kulcsai a `['plantings', …]` alá tartoznak, így a `qk.plantings` érvénytelenítése ezeket is frissíti.
  - Írás a `useApiMutation(fn, [érvénytelenítendő kulcsok])` hookkal, a `lib/api.ts` fetch-burkolóján keresztül.
- **Tervezési év:** a kiválasztott év a `YearProvider`/`useYear` állapota (`lib/year.tsx`, localStorage-ban).
- **Szerkesztés:** a `components/ui/Sheet.tsx` modális lapon történik. A Cmd/Ctrl+Enter megerősít, az Escape bezár, és mindig csak a legfelső lap kezeli a billentyűket. Az űrlapsorok a `Form.tsx` építőelemei (`FormGroup`, `FormRow`, `NumberInput` …). Az e2e teszt `field()` segédje a `FormRow` felirata alapján találja meg a mezőket.
- **Stílus:** CSS modulok és a `styles/tokens.css` változói (iOS rendszerszínek), csak világos téma.

### Egyéb

- **Seed-adatok:** a `seed/*.json`. A `seed/companions.json` társítási adatai a `scripts/build-companions.ts` kimenetei (`npx tsx scripts/build-companions.ts`), a Wind River Greens Plant Variety Database alapján, CC BY 4.0 licenccel; a forrásmegjelölés a README-ben és a Beállítások → Források oldalon van.
- **E2E teszt:** az `e2e/garden-flow.spec.ts` egyetlen hosszú teszt a design dokumentum 14. pontjának folyamatára. A böngésző órája 2027-03-15-re van rögzítve, `hu-HU` lokalizációval, Budapest időzónával.
- **Indító:** a `Kerttervező.command` dupla kattintással indítja az éles módot, és felismeri, ha már fut egy fejlesztői szerver.
