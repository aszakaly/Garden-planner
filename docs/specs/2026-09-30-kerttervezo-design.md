# Kerttervező – MVP megvalósítási terv

## Kontextus
A `Kerttervező alkalmazás - v1.docx` egy saját használatú kert- és veteményes-tervező MVP-t ír le. A fő érték nem a kertrajz, hanem a kertészeti döntések rendszerezése: törzsadatok → vetőmagkészlet → kert/ágyások → éves terv → vetésforgó- és társításellenőrzés → feladatnaptár → tényleges megvalósulás és napló → következő év tervezése az előzmények alapján (spec §14).

A projektmappában jelenleg csak a Word dokumentum van, se kód, se git.

**Döntések (a felhasználóval egyeztetve):**
- **Futtatás:** helyi szerver a Macen (MacBook Air, Node 26, npm 11). Az adatok egyetlen SQLite fájlban vannak. Az otthoni Wi-Fi-n telefonról is elérhető: `http://<gépnév>.local:4321` (a szerver induláskor kiírja a pontos címet).
- **Törzsadatok:** kb. 55 gyakori zöldség-, fűszer- és kísérőnövény előtöltve magyar adatokkal. Minden adat szerkeszthető.
- **Elhelyezés:** az ágyás sávokra/sorokra oszlik. A geometria ágyáson belüli cm-koordinátákban tárolódik (téglalap), így később grafikusan is felhasználható.
- **Klíma:** Közép-Magyarország, az Alföld északi csücske. Alapértékek: utolsó tavaszi fagy május 10., első őszi fagy október 20. Mindkettő szerkeszthető.
- **Felület:** az Apple Emlékeztetők alkalmazására hasonlító dizájn, magyar nyelven, csak világos módban. A sötét mód most nem kell; a színek CSS-változókban lesznek, így később könnyen hozzáadható.
- **Csoportosítás:** a növénycsalád mellett alternatív kategória is lesz: zöldségcsoport a fogyasztott rész szerint (vetésforgó-szakasz). A veteményes-tervezés és a vetésforgó ezzel is dolgozik.
- **Naptár nézet:** kell a feladatlisták mellé.

**Társítási adatforrás:** [bripatch/plant-variety-database](https://github.com/bripatch/plant-variety-database), `data/companion_plants.csv`.
- CC BY 4.0 licenc. Forrásmegjelölés kell: „Wind River Greens Plant Variety Database – plants.windrivergreens.com”.
- 21 880 sor, `relationship` = beneficial/harmful, `reason` szöveggel.
- Fajtaszintű, angol, szabad szöveges nevek („Brassicas”, „Aromatic herbs”), ezért egyszeri build-scripttel faj szintre összevonjuk.
- Elvetett források: OpenFarm (leállt, nincs adatmentés), alecsharpie (túl hiányos), openplantdb (nincs benne társítás).

## Architektúra és technológia
Egyetlen TypeScript projekt, három réteggel:
- `src/shared/` – típusok, zod sémák és **tiszta domain-logika**: dátumszámítás, geometria, vetésforgó, társítás, feladatgenerálás, javaslatok. Ez egységtesztelhető, és a későbbi mobilapp is újrahasználhatja.
- `src/server/` – Fastify REST API (`/api/...`). SQLite a beépített `node:sqlite` modullal, ha az mégsem stabil, `better-sqlite3`. Kézzel írt SQL-migrációk és egy vékony repository-réteg. Élesben a lefordított klienst is ez a szerver szolgálja ki, és a `0.0.0.0` címen figyel a helyi hálózat felé.
- `src/client/` – React + Vite + React Router + TanStack Query. Saját CSS-tokenek (Apple-stílus) és lucide-react ikonok.

Adatok és mentés:
- Az adatbázis: `data/garden.db` (gitignore-olva).
- Minden indításkor automatikus másolat készül a `data/backups/` mappába (az utolsó 30 marad meg).
- JSON export és import a Beállításokban.
- Hitelesítés nincs, csak az otthoni hálózaton fut.

Megfontolt alternatívák (elvetve): Python/FastAPI + htmx (a későbbi mobilapphoz kevésbé illik), SvelteKit (kisebb ökoszisztéma), tisztán böngészős IndexedDB (nincs közös használat).

## Adatmodell (SQLite)
| Tábla | Lényeges mezők |
|---|---|
| `settings` | utolsó és első fagy (MM-DD), régió, aktuális év |
| `plant_family` | magyar és latin név, `rotation_gap_years` (pl. káposztafélék 4, burgonyafélék 3, tökfélék 3) |
| `crop_group` | **Zöldségcsoport a fogyasztott/hasznosított rész szerint** (szerkeszthető lista): gyökér- és gumós zöldségek, hagymás zöldségek, levélzöldségek, szár- és virágzöldségek (pl. karalábé, karfiol, brokkoli), természöldségek, hüvelyesek (mag/hüvely), fűszernövények, kísérő- és virágnövények, évelők. Mindegyikhez tartozik egy alapértelmezett `rotation_stage` és egy sorrend. |
| `plant` | magyar és latin név, `family_id`, `crop_group_id`, **`rotation_stage`** (vetésforgó-szakasz a klasszikus négyes forgóban: hüvelyes → levél → termés → gyökér; a csoportból öröklődik, de felülírható; évelőknél, fűszer- és kísérőnövényeknél üres), `nutrient_group` (1 = erős, 2 = közepes, 3 = gyenge/hüvelyes), `perennial`, `frost_sensitive`, tőtáv és sortáv (cm), napok a betakarításig, betakarítási időtartam, `seed_viability_years`, `aliases_en`, forrás |
| `variety` | `plant_id`, név, leírás, opcionális felülírások (napok, tőtáv), jegyzet |
| `growing_window` | `plant_id` vagy `variety_id`; szezon (tavaszi, nyári, őszi, áttelelő); módszer (helyrevetés, palánta); vetési ablak; palántanevelés hossza (hét); kiültetési ablak; betakarítási ablak (`year_offset`-tel az évhatáron átnyúlóknak, pl. fokhagyma); `succession_days` (újravetés). **Növényenként több szezon is lehet.** |
| `companion` | `plant_a_id` < `plant_b_id`; `relation` (+1 kedvező / 0 semleges / −1 kerülendő); magyar indoklás; forrás (`windrivergreens` vagy `user`) |
| `seed_stock` | `variety_id`; eredet (bolt/beszállító); típus (vásárolt, saját fogású, csere); évjárat; `in_stock`; mennyiség (szöveg); jegyzet |
| `garden`, `bed` | ágyás: név, szín, hossz és szélesség (cm), `row_direction` (keresztben/hosszában), **`pos_x`, `pos_y`, `rotation`** (a későbbi grafikus nézethez), típus (földágyás, emelt ágyás, fólia, üvegház), napfény, talaj, öntözés, `active_from`/`active_to` év |
| `plan_year` | év, státusz (tervezés, aktív, lezárt), jegyzet |
| `planting` | **A központi rekord.** `year`, `variety_id` vagy `plant_id`, `seed_stock_id`, `bed_id`, geometria (`axis_start_cm`, `axis_span_cm`, `cross_start_cm`, `cross_span_cm`), sorok, tőszám, módszer (helyrevetés, saját palánta, vásárolt palánta), `window_id`. **Terv mezők:** vetés, kiültetés, betakarítás kezdete, terület felszabadulása. **Tény mezők** ugyanezekre (üres = még nem történt meg), tényleges ágyás és geometria, ha eltér. `status` (terv, folyamatban, lezárt, elmaradt, sikertelen), `series_id` (újravetés-sorozat), szezonvégi értékelés (siker 1–5, termés, újravetésre ajánlott igen/nem/talán, jegyzet). |
| `task_state` | a generált feladat kulcsa (`planting_id` + típus + index), elvégezve (dátum), áthelyezett dátum, jegyzet |
| `custom_task` | saját feladat: cím, dátum, ágyás vagy ültetés, elvégezve |
| `journal_entry` | dátum, `planting_id`/`variety_id`/`bed_id`, típus (megfigyelés, termés, betegség, kártevő, probléma, általános), szöveg, mennyiség és egység, minőség 1–5, címkék, FTS5 teljes szöveges index |

Múltbeli évek:
- A `planting` rekord konkrét dátumok nélkül is felvehető („gyors előzmény”), de **az évet kötelező megadni** (`year NOT NULL`, az API is ellenőrzi). Így az első napon rögzíthető több év vetésforgó-története, ahogy a spec §12 kéri.
- Az évhatáron átnyúló és az évelő kultúrák teljes ISO-dátumokkal tárolódnak. A lekérdezések dátumintervallumra szűrnek, nem csak évre.

## Domain-logika (`src/shared/domain/`, mind egységtesztelve)
- **`dates.ts`** – Ablakok (MM-DD + `year_offset`) konkrét dátumokká alakítása. Palántánál: vetés = kiültetés − nevelési hetek. Betakarítás = foglalás kezdete + napok, a fagyérzékeny kultúráknál legkésőbb az első fagyig. Figyelmeztet, ha fagyérzékeny kultúra a tavaszi fagyhatár előtt kerülne ki.
- **`geometry.ts`**
  - A sorok számából és a sortávból az ágyás tengelye mentén foglalt szakasz; a tőszám a keresztirányú szélesség és a tőtáv hányadosa.
  - Téglalapok átfedése és szomszédossága (≤ 10 cm hézag), időbeli átfedéssel együtt.
  - Szabad sávok keresése egy adott időszakra.
- **`rotation.ts`** – Az adott ágyás(-rész) előzményei N évre visszamenőleg, a **tény adatok alapján** (a terv csak a jelenlegi és a jövőbeli éveknél számít). Szabályok:
  1. Ugyanaz a család a `rotation_gap_years` időn belül.
  2. Ugyanaz a növény egymást követő években.
  3. A tápanyagigény-sorrend megsértése (erős → közepes → gyenge/hüvelyes).
  4. A vetésforgó-szakasz sorrendje (hüvelyes → levél → termés → gyökér): jelzés, ha egy szakasz ismétlődik vagy kimarad. Az ágyásnál a „következő javasolt szakasz” is megjelenik.
  5. Éven belüli utóvetemény ugyanabból a családból.

  Az eredmény: `{szint: ok|info|figyelem|kerülendő, üzenet, hivatkozások}`.
- **`companions.ts`** – Az időben átfedő ágyástársak és (erősebb súllyal) a közvetlen szomszédok kapcsolata a `companion` tábla alapján, zöld, szürke és piros jelöléssel, indoklással.
- **`tasks.ts`** – A tervből determinisztikusan generált feladatok, mindegyik kulccsal és dátumablakkal:
  - vetőmag beszerzése (tervezett fajta, de nincs készleten, jan–feb, vagy 3 héttel a vetés előtt);
  - palántanevelés (vetés tálcába);
  - szoktatás (1 héttel a kiültetés előtt);
  - kiültetés, helyrevetés, újravetés;
  - betakarítás kezdete;
  - ágyásrész felszabadul.
- **`suggestions.ts`** („Mi kerülhet ide?”) – Egy ágyásrészhez és időszakhoz rangsorolja a fajtákat a meglévő ellenőrzések alapján: készleten van, a vetésforgó rendben, jó a társítás a szomszédokkal, belefér az időablakba, elfér a sávban.

## Felület (Apple Emlékeztetők stílus)
- **Oldalsáv** (áttetsző, lekerekített), tetején az évválasztó (pl. „2027 ▾”).
  - **Okoslisták csempékben, darabszámmal:** Ez a hét, Ütemezett (havi bontás), Naptár, Figyelmeztetések, Napló.
  - **„Kertem”:** az ágyások színes kör-ikonnal és aktív ültetésszámmal.
  - **„Adatok”:** Növények, Vetőmagkészlet, Kert és ágyások, Beállítások és források.
- **Fő nézet:** nagy félkövér cím, „inset grouped” listák, Emlékeztetők-szerű kör alakú pipálók a lista színével, „+ Új …” sor a lista alján, és „ⓘ” gombbal megnyíló részletpanel.
- **Ágyás nézet:** SVG idővonal, ahol vízszintesen a hónapok, függőlegesen az ágyás tengelye (sávok) láthatók, az ültetések téglalapként. Egyszerre mutatja az utóveteményeket és a helykihasználást; szaggatott keret a terv, kitöltés a tény. Alatta szezononként csoportosított lista, figyelmeztető jelölésekkel.
- **Naptár nézet** (az Apple Naptár havi nézetéhez hasonló):
  - Havi rács, napokra bontva, színes pöttyökkel és címkékkel. Tartalma: generált feladatok, saját feladatok, tényleges események (vetés, kiültetés, betakarítás) és naplóbejegyzések.
  - A színek az ágyások színei; szűrni lehet ágyásra és típusra.
  - Egy napra kattintva a nap listája jelenik meg, ahol pipálni és új bejegyzést felvenni is lehet.
  - Váltható éves áttekintésre: 12 mini-hónap, rajtuk a vetési és betakarítási időszakok sávjai.
  - Fölötte jelölve a tavaszi és az őszi fagyhatár.
- **Növénylista:** csoportosítható **növénycsalád, zöldségcsoport (fogyasztott rész), vetésforgó-szakasz vagy tápanyagigény** szerint (szegmentált vezérlő). Ugyanez a választó megjelenik az ágyás-előzményekben és a vetésforgó-nézetben is.
- **Növény adatlap:** 12 hónapos naptársáv szezononként (vetés, palánta, kiültetés, betakarítás), társítások (kedvező és kerülendő), család, zöldségcsoport, vetésforgó-szakasz és tápanyagcsoport, fajták, korábbi termesztések és naplóbejegyzések. Ez lesz a saját tudásbázis.
- **Naplóbejegyzés felvitele:**
  - Honnan: a „Napló” okoslista „+ Új bejegyzés” sorából, továbbá az ültetés, ágyás, fajta és naptárnap nézetekből, ilyenkor előre kitöltött kapcsolattal.
  - Mezők: dátum (visszamenőleg is), típus, kapcsolódó ültetés/fajta/ágyás, szöveg, termésmennyiség és egység, minőség 1–5, címkék.
  - A napló listája dátum szerint csoportosított, kereshető és szűrhető típusra, ágyásra, fajtára és évre.
- **Ültetés-szerkesztő** (sheet):
  - fajta vagy készlet kiválasztása, módszer és szezon;
  - javasolt dátumok, felülírhatók;
  - elhelyezés: sorok száma vagy hossz, a sávsávban megjelenítve;
  - **élő vetésforgó- és társításellenőrzés**;
  - újravetés-sorozat;
  - „Mi kerülhet ide?” gomb.
- **Feladat pipálása** (vetés, kiültetés, betakarítás): beírja a tény dátumát (alapból a mai napot, visszavonható), ha kell, a státuszt is frissíti.
- Rendszerbetűtípus (`-apple-system`), iOS rendszerszínek, csak világos téma, és telefonos elrendezés, ahol az oldalsáv a gyökérlista lesz, mint az iPhone-os Emlékeztetőkben.

## Előtöltött adatok (`seed/`)
- **`families.json`**, **`crop_groups.json`**, **`plants.hu.json`**: kb. 56 növény. Mindegyikhez tartozik család, zöldségcsoport, vetésforgó-szakasz és tápanyagcsoport, magyar ablakok (több szezonnal: retek, saláta, spenót, borsó, karalábé, pak choi, fokhagyma áttelelve stb.) és angol aliasok. Az alábbi felsorolás család szerinti; a zöldségcsoport-besorolás minden növénynél külön mező.
  - Burgonyafélék: paradicsom, paprika, padlizsán, burgonya.
  - Tökfélék: uborka, cukkini, patisszon, sütőtök, görögdinnye, sárgadinnye.
  - Káposztafélék: fejes káposzta, kelkáposzta, karfiol, brokkoli, karalábé, kelbimbó, fodros kel, **pak choi (bordás kel)**, retek, rukkola, torma.
  - Ernyősök: sárgarépa, petrezselyem, zeller, paszternák, kapor, édeskömény, koriander.
  - Hagymafélék: vöröshagyma, fokhagyma, póréhagyma, metélőhagyma, mogyoróhagyma.
  - Pillangósok: bokorbab, futóbab, zöldborsó.
  - Libatopfélék: cékla, spenót, mángold.
  - Fészkesek: saláta, endívia, napraforgó, körömvirág, büdöske.
  - Egyéb: csemegekukorica; bazsalikom, kakukkfű, rozmaring, zsálya, borsikafű, oregánó, menta, citromfű; sarkantyúka, borágó, eper.
- Az időpontok általános magyar vetési naptárértékek. Megvalósításkor legalább két magyar forrással keresztbe ellenőrzöm őket, és az adatlapon jelölöm, hogy „alapérték, ellenőrizendő”.
- **`scripts/build-companions.ts`** (egyszeri, a kimenet bekerül a repóba):
  - letölti a bripatch CSV-t, és az aliasok alapján a saját növényeinkhez rendeli a neveket;
  - a csoportneveket kibontja (pl. „Brassicas” → a teljes káposztaféle család);
  - fajpáronként többségi döntést hoz: az ellentmondó párok semlegesek lesznek, jelöléssel;
  - a leggyakoribb indoklást magyarra fordítja;
  - a kimenet: `seed/companions.json`.
- A forrásmegjelölés a Beállítások → Források oldalon és a README-ben szerepel.

## Megvalósítási lépések
Minden lépés végén futnak a tesztek, és commit készül.
0. **Alapok.**
   - `git init`, és a specifikáció mentése a `docs/specs/2026-09-30-kerttervezo-design.md` fájlba.
   - A projektváz felállítása (Vite, React, Fastify, SQLite, Vitest), npm scriptek (`dev`, `build`, `start`, `test`), migrációs keret, dizájntokenek, alkalmazáskeret (oldalsáv és listaelemek).
   - **Ellenőrzőpont:** képernyőkép a felületről (asztali és telefonos méret) → a felhasználó jóváhagyja a dizájnt.
1. **Törzsadatok.** Családok, zöldségcsoportok, növények, fajták, szezonablakok és társítások (CRUD). Seed- és build-script, növénylista csoportosítás-váltóval, adatlap, források oldal.
2. **Vetőmagkészlet.** CRUD, szűrők (készleten van/nincs, évjárat), figyelmeztetés a lejárt csírázóképességre.
3. **Kert és ágyások.** CRUD, méretek és adottságok, a későbbi grafikához szükséges pozíciómezők.
4. **Éves terv.**
   - Tervév, ültetés-szerkesztő (dátumszámítás, sávos elhelyezés, tőszám), újravetés-sorozatok.
   - Ágyás-idővonal, túlfoglalás jelzése.
5. **Ellenőrzések.**
   - Vetésforgó- és társításmotor, élő jelzés a szerkesztőben, „Figyelmeztetések” okoslista.
   - Gyors előzmény-rögzítés a múltbeli évekre (az év kötelező).
6. **Feladatok és naptár.**
   - Generálás, Ez a hét és Ütemezett (havi) listák, pipálás a tény dátumának rögzítésével.
   - Saját feladatok, vetőmag-beszerzési feladatok.
   - Naptár nézet: havi rács, nap-lista és éves áttekintés.
7. **Tény és napló.**
   - Státuszok, tényleges hely és dátumok, szezonvégi értékelés.
   - Naplóbejegyzés felvitele és szerkesztése (Napló okoslistából és kontextusból, visszamenőleges dátummal), naplólista szűrőkkel.
   - Teljes szöveges keresés, fajtaszintű tudásbázis-nézet.
8. **Következő év és kényelmi funkciók.**
   - Új tervév (évelők átvitele), „Mi kerülhet ide?” javaslatok.
   - JSON export/import, automatikus mentés.
   - PWA manifest (iPhone főképernyő), `Kerttervező.command` indító, README (indítás, telefonos elérés, mentés).

## Ellenőrzés
- **Egységtesztek (Vitest)** a `src/shared/domain` modulokra. Kiemelt esetek:
  - évhatáron átnyúló ablak (fokhagyma);
  - több szezon (retek tavasszal és ősszel);
  - palánta visszaszámolása;
  - fagyhatár;
  - téglalap-szomszédosság és -átfedés időben;
  - vetésforgó több év előzménnyel (a tény felülírja a tervet);
  - vetésforgó-szakasz sorrendje (hüvelyes → levél → termés → gyökér);
  - „Brassicas” csoportkibontás;
  - a feladatkulcsok stabilak maradnak a terv módosítása után.
- **API-tesztek** a Fastify `inject` segítségével, átmeneti SQLite fájllal:
  - migráció és seed üres adatbázisra;
  - év nélküli ültetés elutasítva (400);
  - naplóbejegyzés létrehozása, szerkesztése, törlése és FTS-keresése;
  - a naptár-végpont egy hónap eseményeit adja vissza.
- **Végponttól végpontig (Playwright)** a spec §14 folyamatára:
  1. fajta kiválasztása;
  2. készlet rögzítése;
  3. ágyás létrehozása;
  4. 2027-es terv: paradicsom mellé édeskömény → piros társítási jelzés;
  5. burgonyafélék után burgonyafélék → vetésforgó-figyelmeztetés;
  6. feladat megjelenik a helyes hónapban és a naptár nézet megfelelő napján;
  7. pipálás → a tény dátuma rögzül;
  8. naplóbejegyzés felvitele az ültetéshez (termés, minőség, megjegyzés) → megjelenik a Naplóban, a naptárban és a fajta adatlapján, és a keresés megtalálja;
  9. múltbeli (2025-ös) előzmény gyors rögzítése csak évvel → a vetésforgó-ellenőrzés figyelembe veszi;
  10. 2028-as terv: a javaslat a tényleges előzményt veszi figyelembe.
- **Kézi ellenőrzés:** `npm start`, majd megnyitás a böngészőpanelen. Képernyőképek asztali és mobil nézetben; elérés iPhone-ról a `http://<gépnév>.local:4321` címen.

## Bővítések az MVP után
Az MVP lezárása után hozzáadott funkciók döntései. A fenti terv változatlan; a felhasználói összefoglaló a [CHANGELOG.md](../../CHANGELOG.md)-ben van.

### Ágyás másolása (2026-10-01)
**Cél:** több egyforma ágyás (pl. 11 emelt ágyás) gyors felvétele, egyenkénti kitöltés helyett.
- **Felület:** az „Új ágyás” lapon „Minta” választó (egy meglévő ágyás) és „Darabszám” mező (1–50), a létrejövő nevek előnézetével. Az ágyás oldalán a „Másolás” gomb ugyanezt a lapot nyitja meg, az adott ágyással mintaként.
- **Mi másolódik:** méret, szín, típus, sorok iránya, elforgatás, adottságok, megjegyzés, használati évek.
- **Mi nem másolódik:**
  - ültetések, előzmények, napló – ezek az adott ágyás történetéhez tartoznak, és a vetésforgó-ellenőrzés is ágyásonként számol;
  - a kertbeli hely (`pos_x`, `pos_y`), mert két ágyás nem állhat ugyanott.
- **Névsorszámozás** (`src/shared/domain/beds.ts`, `numberedNames`):
  - a név utolsó olyan számát lépteti, amelyet nem követ betű: „Emelt ágyás 7.” → „8.”, „1. ágyás” → „2. ágyás”, de „E2E ágyás” → „E2E ágyás 2”;
  - megtartja a nullákkal kitöltött szélességet („Á-09” → „Á-10”);
  - a foglalt neveket kis- és nagybetűtől függetlenül kihagyja;
  - a felület előnézete és a szerver ugyanezt a függvényt használja;
  - egyetlen ágyásnál a beírt név marad: az ágyásnév továbbra sem kötelezően egyedi.
- **API:** `POST /api/beds/batch` `{ bed, count }`, ahol a `count` 2–50. Egyetlen ágyás továbbra is a `POST /api/beds` végponton jön létre.
  - Egy tranzakcióban hozza létre az ágyásokat: vagy mind létrejön, vagy egy sem.
  - Mindegyik saját, növekvő `sort_order`-t kap a lista végén, így a létrehozás sorrendjében jelennek meg (a névsor szerinti rendezés a „10”-et a „2” elé tenné).
- **Tesztek:** egységtesztek a sorszámozásra, API-teszt a tömeges létrehozásra, és a végponttól végpontig tartó folyamat 11. lépése (másolás három példányban).
