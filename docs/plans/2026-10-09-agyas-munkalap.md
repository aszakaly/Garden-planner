# Ágyás-munkalap – megvalósítási terv

**Cél:** az ágyás oldala legyen a tervezés egyetlen helye: kiosztás, ültetési adatok, javaslatok és figyelmeztetések egy képernyőn. A követelmények a [design dokumentum](../specs/2026-09-30-kerttervezo-design.md) „Ágyás-munkalap (2026-10-09)” szakaszában vannak, a képek a [wireframe-ek](../wireframes/2026-10-09-agyas-tervezes/index.html) között (az „A” változat).

**Végrehajtás:** a CLAUDE.md „Munkamódszer” szerint. A munka a fő sessionben folyik, az `agyas-tervezes` branchen; lépésenként egy commit. Kipróbálás csak a `kerttervezo-uitest` példányon. Az átnézés a 4. lépésben, egyben történik.

**Felépítés röviden:** a Kiosztás lap szerkesztője (ágyáskép, sávlista, piszkozat) kikerül a lapról az ágyás oldalára. Mellé kerül egy panel, amely a javaslatmotort és az ültetési lap tervezési űrlapját használja. Adatbázis-módosítás nincs; a tömeges mentés annyiban bővül, hogy az új ültetések sorozatot alkothatnak.

---

## Döntések

**Egyeztetve (2026-10-09):**
- Az „A” irány: ágyáskép és panel. A munkalap maga az ágyás oldala; a Kiosztás lap és az ágyás oldali „Mi kerülhet ide?” lap megszűnik.
- Piszkozat és mentés-sáv. Mentetlen módosításnál az oldal elhagyása előtt rákérdez.
- Elsődleges a Mac; telefonon a panel alsó lap.
- Minden tervezési adat a panelen szerkeszthető; a tény és a napló a meglévő ültetési lapon marad.
- Az „Ültetések [év]” lista összecsukva az oldal alján marad. A sorára kattintva a munkalap kijelöli az ültetést, és a napját is odaállítja.
- Belépések: az ágyáshoz kötöttek a munkalapra visznek (Éves terv, Figyelmeztetések). A hely nélküli új ültetés, a feladatok és a naptár a meglévő lapot nyitja.
- A figyelmeztetés nem vehető tudomásul; a mentést nem tiltja.
- Az újravetés a panelen kapcsolható be, a tagok új sávként jelennek meg a piszkozatban.

**A tervben javasolt, elfogadva (2026-10-09):**
- **Nyitónap:** az idei évben a mai nap, más évben a fővetemény napja. A mostani alapérték június 15.; az új a fázisválasztóhoz igazodik.
- **Kijelölés megszüntetése:** az Esc, vagy kattintás az ágyáson kívülre. Ilyenkor a panel az áttekintést mutatja.
- **Mentés billentyűvel:** a Cmd/Ctrl+Enter is ment, mint a lapokon. Mentés közben a munkalap zárolva van.
- **Elhagyás előtti kérdés:** útvonalváltáskor, az év váltásakor (oldalsáv) és a böngészőlap bezárásakor jelenik meg.
- **Mentési ütközés:** ha egy ültetés közben máshol (pl. telefonon) törlődött, a mentés-sáv ezt kiírja, és „Elvetés és frissítés” gombot ad. Ha csak módosult, az utolsó mentés nyer, mint eddig. Összefésülés nincs.
- **„Tény és napló”:** a meglévő ültetési lap a Tény fülön nyílik, Terv fül nélkül, mert a terv a panelen szerkeszthető. Mentetlen módosításnál előbb ment, mint most a „Mentés és részletek”.
- **Kapcsolt sávok:** a panelen „Kapcsolt sávokon is” kapcsoló, alapból bekapcsolva. A fajta, a vetőmag, a módszer és a dátumok változása a párokra is átkerül a piszkozatban.
- **Mentés-sáv:** a mentendő ültetések számát mutatja (új, módosított, törölt), és azt, hány kerülendő jelzésű sáv van a piszkozatban.
- **Ágyásadatok:** a fejléc egy sorában a típus, a méret, a terület, a sorok iránya és a napfény. A többi a szerkesztő lapon érhető el.
- **Belépés hivatkozása:** `/agyas/:id?ultetes=…`. Nyitáskor kijelöli az ültetést, és a napot a kezdetére állítja, ha az aktuális napon nem áll az ágyásban.

---

## Elfogadási esetek

Mindhárom eset a `kerttervezo-uitest` példányon, a 2027-es évben fut. Az E1 telefonméretben (375 px) is végigvihető.

**E1 – Fővetemény sorai (a saját gyakorlatod):** üres, 80 cm széles, 3 m hosszú földágyás, hosszában futó sorokkal, előzmény nélkül.
1. Nyitáskor semmi sincs kijelölve. Az áttekintés szerint az ágyás üres, a szabad helyek között a teljes ágyás szerepel.
2. A fővetemény napján (júl. 1.) a szabad helyre kattintva a javaslatok között a paradicsom is ott van, mert máj. 10-től a helyén áll. A retek legfeljebb nyári vagy őszi vetéssel szerepelhet, a márciusival nem.
3. A paradicsomot választva 80 cm-es sáv lesz belőle (sortáv 80 cm), kijelölve; a dátumai a vetési naptárból jönnek.
4. A szélességét 30 cm-re állítva mellette 50 cm szabad hely jelenik meg. Erre kattintva a bazsalikom „Jó szomszéd: paradicsom” okkal ajánlott; választás után kitölti a helyet (30–80 cm), mert az alapszélessége (kb. 60 cm-nyi sor) nem fér el.
5. A paradicsomnál a „Még egy sáv ebből” hely híján a sorokat arányosan keskenyíti, és a másolat a végére kerül (20–35–25 cm). Léptetőkkel 30–20–30 cm-re állítom.
6. A határokon zöld vonal látszik, a mentés-sávon „3 nem mentett módosítás”. Mentés után az adatbázisban három ültetés van: 0–30, 30–50 és 50–80 cm.

**E2 – Utóvetemény a fokhagyma után:** Emelt ágyás 1, 4 × 1,2 m, keresztben futó sorok. A 2026 őszén ültetett fokhagyma tény adatos, 325–400 cm-en áll, a szedése 2027. júl. 20-ig tart.
1. A fokhagymára kattintva a panel lakatot mutat: a hely nem módosítható. Az „Ezen a helyen 2027-ben” sorban: fokhagyma → „+ Utána · júl. 20-tól”.
2. A „+ Utána” javaslatai júl. 20-tól szólnak erre a helyre. A hagymafélék kerülendők (a fokhagyma a 2026-os évhez tartozik, ezért „Családi szünet” vagy „Tavaly is itt volt” okkal), a spenót a javaslatok között van.
3. A spenótot választva a vetési naptár szerinti nyár végi vagy őszi vetéssel 325–400 cm-re kerül, kijelölve. Az ágyáskép a spenót kezdetének napjára vált.
4. A panelen fajtát és vetőmagot választok, majd mentek. A spenót az utóvetemény napján is látszik.

**E3 – Kerülendő kiváltása, újravetés, belépés:** ugyanez az ágyás; 2025-ben burgonya volt benne.
0. Előkészítés: a munkalapon a fővetemény napján paradicsomot teszek a 180–240 cm-es helyre, és mentek. A kerülendő választás is lehetséges, a figyelmeztetés látszik.
1. A Figyelmeztetések oldalon a paradicsom vetésforgó-figyelmeztetésére kattintva a munkalap nyílik. A 180–240 cm-es paradicsom ki van jelölve a fővetemény napján, rajta piros jel; a mentés-sáv nem látszik, mert nincs mentetlen módosítás.
2. A „Mi kerülhetne ide helyette?” erre a helyre ad javaslatokat (a paradicsom nélkül). A bokorbabot választva a hely és a szélesség marad, a dátumok és a sorszám a bokorbabé lesz, a figyelmeztetés eltűnik.
3. Egy szabad helyre salátát teszek, és bekapcsolom az újravetést: 3 hetente, 3 vetés. A két további tag azonnal megjelenik az ágyásképen és a sávlistán: ahol az előző tag addigra lekerül, ugyanoda, különben mellé.
4. Mentés után az adatbázisban a bokorbab és a három saláta van, a saláták egy sorozatban.

---

## Modulok (kód nélkül)

| Hely | Szerep |
|---|---|
| `features/garden/BedPage.tsx` (mód.) | Az oldal kerete: fejléc, munkalap, alsó blokkok. |
| `features/garden/workspace/` (új) | `useBedWorkspace`: a munkalap állapota (piszkozat a `layoutDraft.ts`-re építve, nap, kijelölés, mentés, ellenőrzések a piszkozatra). Panelek: áttekintés, szabad hely, sáv. `SuggestionList`: rangsorolt lista kereséssel és előnézettel. Mentés-sáv, elhagyás előtti kérdés. |
| `LayoutCanvas`, `LayoutRowList`, `LayoutPhasePicker` (mód.) | A szabad hely kijelölhető elem, előnézet a javaslathoz, telefonos változat. |
| `BedLayoutSheet.tsx` | Megszűnik. |
| `features/plan/plantingForm.ts` (új) | Az ültetési lap űrlaplogikája: időszak és módszer, a dátumok újraszámolása, sorok és szélesség, fajta és vetőmag. A lap és a panel közösen használja. |
| `PlantingEditSheet.tsx`, `SuggestionSheet.tsx` (mód.) | A lap a `plantingForm.ts`-re épül, és a munkalapról Terv fül nélkül nyílik. A javaslat-lap a `SuggestionList`-et használja, és csak az ültetési lapon marad meg (hely nélküli új ültetés). |
| `shared/domain/suggestions.ts` (mód.) | Kijelölt nap, keresés egy sáv előtt és után, beszúrási hely (új sáv szabad hely nélkül). |
| `shared/domain/layout.ts` (mód.) | Az új sáv helyének szabálya (most tesztelés nélkül a `BedLayoutSheet`-ben van), és az újravetés tagjainak elhelyezése. |
| `shared/schemas.ts`, `server/repos/plantings.ts` (mód.) | A tömeges mentés új elemei közös sorozatkulccsal sorozatot alkothatnak (`series_id`, `series_index`). |
| `PlanPage`, `NextYearPanel`, `WarningsPage` (mód.) | Az ágyáshoz kötött belépések a munkalapra visznek. |
| `e2e/garden-flow.spec.ts` (mód.) | A 12. lépés helyett az E1 és az E3 lényege. |

---

## Lépések

### 1. Végigkattintható munkalap (E1 gépen)
- Az ágyás oldala munkalappá alakul: egysoros fejléc, időválasztó, ágyáskép, sávlista és panel. Alul az idővonal (összecsukható), az ültetések listája (összecsukva), a napló és az előzmények.
- Oldalszintű piszkozat a Kiosztás logikájával: mentés-sáv, Cmd+Enter, zárolás mentés közben, kérdés az oldal elhagyása előtt.
- Kijelölés és panel:
  - áttekintés: vetésforgó-javaslat, figyelmeztetések, helyütközés a javítógombokkal;
  - szabad hely: javaslatlista, kereső, előnézet;
  - sáv: a mostani részletek (léptetők, szétvágás, még egy sáv, törlés) és a figyelmeztetései;
  - „+ Új sáv”: javaslatlista az egész ágyásra (szabad hely nélkül a 2. lépés teszi teljessé).
- Domain, egységtesztekkel: a javaslat a kijelölt napra; az új sáv helyének szabálya a `layout.ts`-be kerül.
- A Kiosztás lap és az ágyás oldali javaslat-lap megszűnik.

**Kész, ha:** az E1 gépen végigvihető, és az `npm test`, valamint a `typecheck` hibátlanul lefut. Ezután commit, és kipróbálod.

### 2. Tervezési adatok, idő, újravetés (E2, E3/2–4)
- A `plantingForm.ts` kiemelése az ültetési lapból; a lap átáll rá, a viselkedése nem változik.
- Sáv-panel: növénycsere, fajta, vetőmag, időszak és módszer, dátumok, sorok, tőszám, kapcsolt sávok.
- „Ezen a helyen [év]” sor, „+ Elővetemény” és „+ Utána” javaslattal; „Mi kerülhetne ide helyette?” csere.
- Új sáv szabad hely nélkül: beszúrási javaslat a kijelölt sáv mellé.
- Újravetés a piszkozatban; a tömeges mentés sorozattal (séma, szerver, API-teszt).
- „Tény és napló”: a lap Terv fül nélkül nyílik; mentetlen módosításnál előbb ment.

**Kész, ha:** az E2 és az E3 2–4. pontja végigvihető, a tesztek hibátlanok. Ezután commit.

### 3. Belépések, áttekintés, telefon (E3/1, E1 telefonon)
- Az áttekintés kiegészül:
  - elhelyezésre váró ültetések, „Hely kijelölése” gombbal (a választott napon az első szabad helyre kerül, vagy helyet csinál);
  - szabad helyek szezononként;
  - kihasználtság.
- Belépések: az Éves terv ágyásban álló ültetései (a listában és az idővonalon) és ágyásonkénti javaslata, valamint a Figyelmeztetések a munkalapra visznek, kijelöléssel.
- Telefon: a panel alsó lap, az időválasztó szegmentált vezérlő, az Elvetés és a Mentés a fejlécben.
- Mentési ütközés: törölt ültetésnél „Elvetés és frissítés”.

**Kész, ha:** az E3 1. pontja és az E1 telefonméretben is végigvihető. Ezután commit.

### 4. Ellenőrzés és lezárás
- E2E: a 12. lépés helyett az E1, és az E3-ból a csere, a figyelmeztetés eltűnése és a mentés.
- Egy átnézés a teljes egységre:
  - a kód;
  - az adatírás: tömeges mentés, sorozat, tranzakció, export és visszatöltés;
  - az E1–E3 végigjátszása a böngészőben.

  A találatok súlyosság szerinti listába kerülnek.
- Egy javítókör: a kritikusokat azonnal javítom, a többiről te döntesz.
- A CHANGELOG és a CLAUDE.md architektúra-részének frissítése (a Kiosztás helyett a munkalap), majd összefoglaló. Ezután commit; a branch a jóváhagyásod után squash-olva kerül a `main`-be.

---

## A korábbi átnézésből nyitva maradt tételek

| Tétel | Mikor | Miért |
|---|---|---|
| Az új sáv helyének szabálya tesztelés nélkül a `BedLayoutSheet`-ben van | 1. lépés | A munkalap és a javaslat is erre épül. |
| Mentés közben indított műveletek elvesznek | 1. lépés | A mentés-sáv zárolja a munkalapot. |
| A mentés tartósan 404-et ad, ha egy ültetés máshol törlődött | 3. lépés | Oldalszintű piszkozatnál gyakoribb (gép és telefon egyszerre). |
| Firefoxban az ágyáskép szélessége 0 | 3. lépés | Kis javítás. |
| Az arányos helycsinálás nem nézi a más időpontban álló ültetéseket | most nem | Az ütközést a meglévő jelzés és javítógomb kezeli. |
| A `placeInFree` nem igazítja a szélességet a rácshoz, a szélen keskeny maradék marad | most nem | Kisebb. |
| Azonosító-újrahasznosítás (nincs AUTOINCREMENT) | 1. lépés | Adathibát most nem okoz (a törlés a feladatállapotot és a naplókapcsolatot is rendezi), de a felhasználó kérésére új migráció zárja ki: törölt ültetés azonosítója nem kerül újra kiosztásra. |
| Felesleges `open` prop, minden rendereléskor számolt `isDirty`, a `useDevice` és a `useIsMobile` duplikációja | 1. lépés | A lappal megszűnik, illetve csiszolás közben. |

## Kockázatok
- **A panel mérete:** a részei külön fájlokba kerülnek, az állapot egy hookba, hogy a `BedPage` ne nőjön túl.
- **A javaslatmotor futásideje** (kb. 55 növény × vetési ablakok) minden kijelölésnél: a kijelölésre és a piszkozatra memoizálva fut. A kereső a kész listát szűri, nem számol újra.
- **Az ültetési lap kiemelése** (`plantingForm.ts`) a meglévő viselkedést nem változtathatja meg. Ezt a meglévő e2e lépések és a lap kézi próbája ellenőrzi.
