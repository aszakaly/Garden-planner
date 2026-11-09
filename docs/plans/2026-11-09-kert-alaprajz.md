# Kert alaprajza – megvalósítási terv

**Cél:** az ágyások elhelyezése a kertben, méretarányos, rácsos alaprajzon, húzással. A tervezés (kiosztás, ültetések) továbbra is az ágyás oldalán történik; az alaprajz csak a helyet és az irányt kezeli.

**Végrehajtás:** a CLAUDE.md „Munkamódszer” szerint, a `kert-alaprajz` branchen, lépésenként egy commit. Kipróbálás a `kerttervezo-uitest` példányon. Az átnézés a 3. lépés végén, egyben.

---

## Döntések

**Egyeztetve (2026-11-09):**
- A kert egyetlen téglalap. Az L/U alak (ház, sufni, gazdasági épület) később jöhet, kizárt területként.
- Az ágyás mérete az alaprajzon nem változtatható; csak mozgatás és forgatás.
- Átfedés nincs: az ágyás nem tehető másikra, és nem lóghat ki a kertből.
- Piszkozat Mentés / Elvetés sávval; mentetlen módosításnál az oldal elhagyása előtt rákérdez (mint a munkalapon).
- Telefonon csak megtekintés.

**A tervben javasolt (jóváhagyásra):**
- **Kert mérete:** új `garden.length_cm` és `garden.width_cm` (migráció, üresen). Amíg nincs megadva, az alaprajz helyén egy „Kert mérete” űrlap jelenik meg. Kisebbre csak akkor állítható, ha minden elhelyezett ágyás belefér.
- **Koordináták:** a kert bal felső sarka az origó; `x` a kert hossza mentén, `y` a mélysége mentén. A `pos_x_cm` / `pos_y_cm` az ágyás (forgatás utáni) befoglaló téglalapjának bal felső sarka.
- **Forgatás:** csak 0° vagy 90°. Az R billentyű vagy a „Forgatás” gomb forgat; ha forgatva nem férne el, nem forgat, és ezt kiírja. A szerkesztő lap pozíció- és forgatásmezői megszűnnek: egyetlen helye az alaprajz.
- **Rács:** 10 cm-es illesztés (a 30–40 cm-es utak így pontosan beállíthatók), 10 cm-enként halvány, méterenként erősebb vonal és méterfelirat.
- **Húzás közben:** a négy irányban a távolság a legközelebbi szomszédig vagy a kert széléig („35 cm”). Ütköző helyen az ágyás piros, elengedéskor visszaugrik az utolsó szabad helyre.
- **Elhelyezetlen ágyások:** oldalsávban, onnan húzhatók egyenként a rajzra.
- **Mi látszik:** csak az aktív ágyások; az archiváltak nem foglalnak helyet. Az ágyáson a neve, a mérete és a sorok iránya (vékony vonalak). Duplakattintás vagy telefonon koppintás az ágyás munkalapját nyitja.
- **Nagyítás:** illesztés a képernyőhöz, + / − gomb és Cmd+görgő. Telefonon csippentés.
- **Mentés:** egyetlen `PUT /api/gardens/:id/layout` hívás, a pozíciókkal és forgatásokkal, egy tranzakcióban; a szerver is ellenőrzi az átfedést és a kerethatárt (`HttpError` 400, magyar üzenettel).
- **Export/visszatöltés:** a két új oszlop a meglévő táblákban van, a régebbi export alapértéket (üres) kap.

---

## Elfogadási esetek

A `kerttervezo-uitest` példányon.

**E1 – A mostani veteményes.** A kert 1150 × 550 cm. Felvesz 11 db 200 × 80 cm-es ágyást. Az elhelyezetlenek sávjából 8 ágyást egymás mellé húz, 0°-kal, a hosszuk a kert mélysége mentén; köztük 30–40 cm-es utak, amit húzás közben a távolságfelirat mutat. A maradék 3-at elforgatja (R), és a 8 ágyás végénél, rájuk merőlegesen helyezi el. Ment, újratölt: minden ugyanott van.

**E2 – Ütközés és kert széle.** Egy ágyást a szomszédjára húz: piros lesz, elengedéskor visszaugrik. A kert szélénél forgatna, de nem fér el: nem forgat, üzenetet ír. A kertet 1000 cm hosszúra állítaná, de kilógna egy ágyás: a mentés hibát ad, megnevezi az ágyást.

**E3 – Piszkozat és telefon.** Mozgat két ágyást, majd az Ágyások listára lépne: rákérdez a mentésre; „Elvetés” után az eredeti helyek maradnak. Telefonméretben (375 px) az alaprajz látszik, húzni nem lehet, koppintásra megnyílik az ágyás munkalapja.

---

## Lépések

1. **Adat és API:** migráció a kert méretéhez; a tiszta elhelyezési logika (`domain/gardenPlan.ts`: befoglaló téglalap forgatással, ütközés, kerethatár, szomszédtávolságok, illesztés) egységtesztekkel; `PUT /api/gardens/:id/layout` API-teszttel; a szerkesztő lap pozíciómezőinek eltávolítása.
2. **Alaprajz a Kert oldalon:** rács, nagyítás, húzás illesztéssel és távolságfelirattal, forgatás, elhelyezetlenek sávja, piszkozat és elhagyás előtti kérdés. A végén E1 végigkattintható – itt kérem a kipróbálásod.
3. **Telefon, csiszolás, ellenőrzés:** csak nézet telefonon, e2e bővítés (E1 rövidítve), CHANGELOG, design dokumentum szakasza; átnézés és egy javítókör, majd PR.
