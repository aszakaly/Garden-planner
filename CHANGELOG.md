# Változások

A felületen látható változások, a legújabb elöl. A részletes fejlesztési előzmény a git logban van, a tervezési döntések a [design dokumentumban](docs/specs/2026-09-30-kerttervezo-design.md).

## 2026-10-07 – Ágyás kiosztása

- **Kiosztás** az ágyás oldalán: a sorok húzással és ablakszerű fogantyúkkal méretezhetők; ha egy sáv a szomszédjába ütközik, a szomszéd enged.
- Elő-, fő- és utóvetemény választó (vagy tetszőleges nap): a lap mindig azt mutatja, ami azon a napon az ágyásban áll.
- Új sávhoz elég a növényt kiválasztani: a dátumok a vetési naptárból, a szélesség a sortávból jön. Ha nincs szabad hely, minden sor arányosan enged; a „Még egy sáv ebből” másolata a sorok végére kerül (így lesz paradicsom–bazsalikom–paradicsom).
- Elővetemény a fővetemény helyén is felvehető: a helyütközést egykattintásos javítás oldja fel (a korábbi hamarabb szabadul fel, vagy a későbbi később kezdődik).
- Szétvágás hosszában, sávlista léptetőkkel és áthúzható (billentyűvel is mozgatható) sorokkal, telefonon is.
- A szomszédos sávok határán zöld vagy piros vonal jelzi a társítást.
- A sorszám a sáv szélességével együtt változik, a sűrűbb sorok sűrűk maradnak.
- Kapcsolt sávok: az ültetési lapon a fajta, a vetőmag, a módszer és a dátumok módosítása az azonos ágyásban, azonos dátumokkal álló sávokra is átkerül (kikapcsolható).

## 2026-10-02 – Ágyás másolása: javítások

- A másolat a használati éveket nem veszi át: az új ágyás az idei évtől használatban van, akkor is, ha a minta már megszűnt.
- Több ágyás egyszerre nem kap kertbeli helyet (a lap el is rejti a mezőit), mert nem állhatnak ugyanott.
- Érvénytelen darabszámnál (pl. 60) és túl hosszú sorszámozott névnél a lap kiírja, mi a gond.
- Mentés közben a Cmd+Enter már nem küldi el másodszor a lapot (korábban így kétszer jöhetett létre egy adag ágyás).
- Nagyon hosszú sorszámú névnél a sorszámozás nem fagy le.

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
