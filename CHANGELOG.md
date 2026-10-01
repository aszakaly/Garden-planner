# Változások

A felületen látható változások, a legújabb elöl. A részletes fejlesztési előzmény a git logban van, a tervezési döntések a [design dokumentumban](docs/specs/2026-09-30-kerttervezo-design.md).

## 2026-10-01 – Ágyás másolása

- **Minta új ágyáshoz:** az „Új ágyás” lapon egy meglévő ágyás kiválasztásával betöltődik annak mérete, típusa és adottságai. Az ültetései, az előzményei, a naplója és a kertbeli helye nem másolódnak.
- **Több egyforma ágyás egyszerre:** a „Darabszám” mezővel egy lépésben legfeljebb 50 ágyás vehető fel, a létrejövő nevek előnézetével.
- **Sorszámozott nevek:** a program a név utolsó számát lépteti („Emelt ágyás 1” → „Emelt ágyás 2”, „7.” → „8.”, „1. ágyás” → „2. ágyás”), a már foglalt neveket kihagyja.
- **Másolás gomb** az ágyás oldalán: ugyanezt a lapot nyitja meg, az adott ágyással mintaként.

## 2026-10-01 – Következő év és kényelmi funkciók

- Tervév állapottal és jegyzettel; az évelők átvitele a következő évre.
- „Mi kerülhet ide?” javaslatok ágyásonként: a vetésforgó, a szomszédok, a vetőmagkészlet és a korábbi értékelések alapján.
- Mentés: automatikus és kézi mentés, JSON export és visszatöltés.
- Főképernyőre tehető alkalmazás (PWA) és dupla kattintással indítható `Kerttervező.command`, amely a már futó fejlesztői szervert is felismeri.

## 2026-10-01 – Első teljes változat (MVP)

- Törzsadatok: kb. 55 gyakori növény magyar vetési naptárral, fajtákkal és társítási adatokkal.
- Vetőmagkészlet, kert és ágyások, éves terv sávos elhelyezéssel és idővonallal.
- Vetésforgó- és társítás-ellenőrzés, a múltbeli évek gyors rögzítésével.
- Feladatok és naptár, tényleges dátumok, szezonvégi értékelés és kereshető napló.
