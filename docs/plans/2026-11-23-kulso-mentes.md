# Külső mentés – megvalósítási terv

**Cél:** az éles adatok naponta a szerver 4 TB-os lemezére és a Dropboxba is átkerülnek, így egy lemezhiba vagy a szerver elvesztése sem viszi el őket. A követelmények a [design dokumentum](../specs/2026-09-30-kerttervezo-design.md) „Külső mentés” szakaszában vannak.

**Végrehajtás:** a CLAUDE.md „Munkamódszer” szerint, a `kulso-mentes` ágon, lépésenként egy commit, a fő sessionben. Átnézés a 3. lépés végén, egyben.

---

## Döntések

**Egyeztetve (2026-11-23):**
- Célok: a szerver 4 TB-os lemeze (`/media/sdb2`) és a ZimaOS-be bekötött Dropbox (`/media/dropbox_…`, rclone-csatolás).
- Naponta egyszer, éjszaka. Megőrzés: 30 napi és 12 havi mentés.
- Csak az éles példányról.
- A mentést maga a Kerttervező végzi; az állapota a Beállításokban látszik.

**A tervben javasolt (jóváhagyásra):**
- **Időzítés:** naptári napra szól, nem órák számára. Induláskor és óránként: ha a helyi idő (Europe/Budapest) már elmúlt 03:00, és a mai napra még nincs napi mentés, most készül egy. Így az áramszünet vagy kikapcsolt gép után is pótol. A 03:00 az óraátállítás napjain is pontosan egyszer van (tavasszal 02:00→03:00, ősszel 03:00→02:00), ezért nem marad ki és nem duplázódik; egységteszt a két átállítási napra (2027-03-28, 2027-10-31).
- **Beállítás:** a `KERT_KULSO_MENTES` környezeti változó sorolja fel a célokat (`lemez=/masolat/lemez,dropbox=/masolat/dropbox`). Ha nincs megadva (teszt, Mac, e2e), a funkció ki van kapcsolva, és a felületen sem jelenik meg.
- **Csatolás:** a `zimaos/kerttervezo-eles.yml` két mappát csatol: `/media/sdb2/Kerttervezo-mentes` → `/masolat/lemez` és `/media/dropbox_…/Kerttervezo-mentes` → `/masolat/dropbox`. A Dropbox-mappa pontos nevét a szkript nem a repóból, hanem a szerverről veszi (a `.zima` mellé, helyben), mert a csatolás neve a fiókhoz kötött.
- **Védelem csatolatlan cél ellen:** minden cél gyökerében egy jelölőfájl (`.kerttervezo-mentes-cel`) van, amelyet a kiadó parancs hoz létre. Ha a fájl nincs ott (pl. a Dropbox nincs bekötve, és a konténer egy üres helyi mappát lát), a mentés arra a célra nem ír, és hibát jelez.
- **Fájlok a célon:** `napi/garden-ÉÉÉÉHHNN.db` és `havi/garden-ÉÉÉÉHH.db` (a hónap utolsó napi mentése). Írás ideiglenes néven, majd átnevezés, hogy félbemaradt fájl ne maradjon. A megőrzésen túli fájlokat a mentés utána törli; más fájlhoz nem nyúl.
- **Állapot:** a cél-állapot (utolsó siker ideje, utolsó hiba) a `/data/kulso-mentes.json`-ban, így újraindítás után is megvan. A `GET /api/backups` válasza kiegészül vele. A Beállítások „Mentés és adatok” csoportjában egy sor célonként, pl. „Lemez: ma 03:00 ✓”, „Dropbox: 2 napja nem sikerült ✗ – nincs bekötve”. Egy „Külső mentés most” gomb azonnal lefuttatja.
- **Visszaállás külső mentésből:** a fájlt a `eles/backups/` mappába kell másolni, utána a meglévő `zima:visszatoltes` megy. A `zima:visszatoltes` megtanulja a `napi/…` és `havi/…` neveket is a lemezről, hogy ne kelljen kézzel másolni; a Dropboxból visszaállás a README-ben leírt kézi lépés.
- **Kipróbálás:** a 2. lépésben a teszt példány ideiglenesen saját célmappákat kap (`Kerttervezo-mentes-teszt`), azon próbáljuk végig, majd kikapcsoljuk. Az éles csak a kiadással (`v1.1.0`) kapja meg.

---

## Lépések

**1. Mentés a szerverben.** Időzítés, másolás a célokra, megőrzés, jelölőfájl-ellenőrzés, állapotfájl, API és a Beállítások sora, a „Külső mentés most” gomb; egységtesztek (megőrzés, időzítés, csatolatlan cél). A végére a `kerttervezo-uitest` példányon két helyi mappával végigkattintható.

**2. A szerveren.** ZimaOS-leírás a csatolásokkal, a kiadó parancs létrehozza a célmappákat és a jelölőfájlt; `zima:visszatoltes` a külső mentésekre. Próba a teszt példányon ideiglenes célokkal: mentés, Dropbox-kiesés, visszatöltés.

**3. Lezárás.** README, CHANGELOG, átnézés, javítókör, PR; a merge után `v1.1.0` a tesztre, majd élesre.

---

## Elfogadási esetek

**E1 – Éjszakai mentés.** 03:00 után a lemez és a Dropbox `napi/` mappájában ott a napi fájl, a Beállításokban mindkét cél „ma 03:00 ✓”.

**E2 – Kikapcsolt szerver.** Ha a szerver éjjel ki volt kapcsolva, a reggeli bekapcsolás után néhány percen belül elkészül a pótló mentés.

**E3 – Kiesett Dropbox.** Ha a Dropbox nincs bekötve, a lemezre a mentés megtörténik, a Dropbox sora pirosan jelzi a hibát, és az SSD-re nem kerül helyette semmi.

**E4 – Megőrzés.** 40 nap után a `napi/` mappában 30 fájl van, a `havi/` mappában minden hónapból egy, legfeljebb 12.

**E5 – Visszaállás.** Egy lemezen lévő napi mentésből a `zima:visszatoltes` visszaállítja az élest.
