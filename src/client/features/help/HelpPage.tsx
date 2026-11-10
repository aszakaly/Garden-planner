import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Chapter, Note, Shot, Step, helpAsset } from './HelpParts.tsx';
import s from './HelpPage.module.css';

const CHAPTERS = [
  { id: 'kezdes', title: 'Kezdés', detail: 'mi hol van, és hogyan kerül a telefonodra' },
  { id: 'tervezes', title: 'Tervezés februárban', detail: 'mi kerüljön idén hova' },
  { id: 'kertben', title: 'A kertben, telefonról', detail: 'a heti teendők' },
  { id: 'bevasarlas', title: 'Bevásárlólista', detail: 'milyen magot, palántát kell venni' },
];

/**
 * Felhasználói kézikönyv: helyzetek szerint (nem menüpontok szerint), lépésenként, képekkel.
 * A képeket a `npm run sugo` készíti a mintakertből; a dátumok (2027. február 15., május 10.) onnan vannak.
 */
export function HelpPage() {
  return (
    <div className={s.page}>
      <PageHeader title="Súgó" color="var(--c-blue)" />
      <p className={s.lead}>
        A Kerttervezőben megtervezed, mi kerüljön az ágyásokba, és az alkalmazás ebből elkészíti a szezon teendőit: mikor
        vess, mikor ültess ki, mikor mit vegyél meg. Négy rövid fejezet, abban a sorrendben, ahogy az év halad.
      </p>

      <figure className={s.video}>
        <video
          controls
          playsInline
          preload="none"
          poster={helpAsset('bemutato.jpg')}
          width={1920}
          height={1080}
          aria-label="Bemutatóvideó"
        >
          <source src={helpAsset('bemutato.mp4')} type="video/mp4" />
        </video>
        <p>Bemutatóvideó, két és fél perc, feliratokkal és halk zenével. Telefonon fordítsd el, és nézd teljes képernyőn.</p>
      </figure>

      <nav className={s.toc} aria-label="Fejezetek">
        {CHAPTERS.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            onClick={(e) => {
              // Az URL nem változik (a vissza gomb az előző oldalra visz, nem fejezetek között)
              e.preventDefault();
              document.getElementById(c.id)?.scrollIntoView();
            }}
          >
            {c.title}
            <span>{c.detail}</span>
          </a>
        ))}
      </nav>

      <Chapter id="kezdes" title="Kezdés" intro="Néhány perc, hogy otthon érezd magad: mi hol van, és hogyan nyitod meg a telefonodon.">
        <Step n={1} title="Mit látsz">
          <p>
            Gépen bal oldalon vannak a listák. A színes csempék a teendők különböző nézetei: <b>Ez a hét</b>, <b>Ütemezett</b>{' '}
            (az egész év, hónapok szerint), <b>Naptár</b>, <b>Éves terv</b>, <b>Figyelmeztetések</b> és <b>Napló</b>. A
            számok mutatják, hány nyitott tétel van bennük.
          </p>
          <p>
            Alattuk a <b>Kertem</b> az ágyásaid listája, az <b>Adatok</b> pedig a növényeket, a vetőmagkészletet és a beállításokat
            tartalmazza. A lista tetején, a Kerttervező felirat mellett lévő évszám (pl. 2027) azt mutatja, melyik évet nézed és
            tervezed.
          </p>
          <Shot file="kezdes-asztal.jpg" alt="A Kerttervező kezdőképe gépen: bal oldalon a listák, jobb oldalon az Ez a hét" />
        </Step>

        <Step n={2} title="Telefonon">
          <p>
            Telefonon ugyanezek a listák jelennek meg, egymás alatt. Koppints egyre, és megnyílik. Bal felül a <b>Listák</b>{' '}
            gombbal jutsz vissza.
          </p>
          <Shot file="kezdes-telefon.jpg" alt="A listák telefonon" phone />
        </Step>

        <Step n={3} title="Tedd a főképernyőre">
          <p>
            Nyisd meg az alkalmazás címét a telefonod Safari böngészőjében, majd koppints a <b>Megosztás</b> gombra, és
            válaszd a <b>Főképernyőhöz adás</b> lehetőséget. Innentől saját ikonnal, alkalmazásként nyílik.
          </p>
          <Note title="Jó tudni:">
            A Kerttervező otthon, egy gépen fut. Telefonról akkor éred el, ha az otthoni Wi-Fi-n vagy, és a gép be van
            kapcsolva.
          </Note>
        </Step>
      </Chapter>

      <Chapter
        id="tervezes"
        title="Tervezés februárban"
        intro="Télen érdemes leülni a géphez, és ágyásonként eldönteni, mi kerüljön idén hova. Ezt elég egyszer, nyugodtan végiggondolni: a szezon teendői ebből készülnek el."
      >
        <Step n={1} title="Nézd át az évet">
          <p>
            Az <b>Éves terv</b> az egész kertet mutatja egy idővonalon: soronként egy ágyás, és benne, melyik hónapban mi
            foglalja. A szaggatott keret a terv, a sötétebb vége a betakarítás ideje.
          </p>
          <p>Ellenőrizd, hogy a lista tetején lévő évválasztóban a tervezett év áll-e.</p>
          <Shot file="terv-eves-terv.jpg" alt="Az Éves terv idővonala ágyásonként" />
        </Step>

        <Step n={2} title="Nyiss meg egy ágyást">
          <p>
            Koppints egy ágyásra a <b>Kertem</b> listában. Bal oldalon az ágyás rajza látszik, felülről nézve, jobb oldalon az
            áttekintése. A <b>Vetésforgó</b> részben azt is látod, milyen növény javasolt ide idén.
          </p>
          <Shot file="terv-ures-agyas.jpg" alt="Egy üres ágyás munkalapja az áttekintő panellel" />
          <Note title="Vetésforgó:">
            ugyanaz a növénycsoport ne kerüljön évről évre ugyanoda, mert kimeríti a talajt, és felszaporodnak a kártevői. A
            jó sorrend: hüvelyes, levélzöldség, természöldség, gyökérzöldség, majd újra hüvelyes. Az alkalmazás az előző
            évek ültetéseiből számolja, mi következik.
          </Note>
          <Note title="Elő-, fő- és utóvetemény:">
            egy ágyásban egy év alatt több növény is követheti egymást: tavasszal egy korai (pl. retek), nyáron a fő növény
            (pl. paradicsom), ősszel egy késői. A rajz fölötti három gombbal váltasz köztük.
          </Note>
        </Step>

        <Step n={3} title="Kérj javaslatot">
          <p>
            Koppints az ágyás szabad részére, vagy a <b>Mi kerülhet ide?</b> feliratra. Jobb oldalon megjelenik a javaslatok
            listája, a legjobbak elöl.
          </p>
          <Shot file="terv-mi-kerulhet.jpg" alt="A Mi kerülhet ide? gomb a szabad sávon" />
          <p>
            A zöld címkék mutatják, miért jó a választás: például a vetésforgóban most az következik, vagy van hozzá
            vetőmagod. A lista alján a <b>Kerülendő</b> növények is megnézhetők, és ott azt is látod, miért nem valók ide.
          </p>
          <Shot file="terv-javaslatok.jpg" alt="Javaslatok listája: elöl a bokorbab" />
        </Step>

        <Step n={4} title="Válassz, igazítsd, mentsd">
          <p>
            Koppints egy javaslatra, és az ágyásba kerül egy sávként, a vetési naptár szerinti dátumokkal. A sáv hosszát a{' '}
            <b>−</b> és <b>+</b> gombbal, vagy a szélét húzva állíthatod. Jobb oldalon a fajta, a vetőmag és a dátumok is
            átírhatók, de a javasolt értékek általában jók.
          </p>
          <p>
            A módosítás addig csak vázlat, amíg alul a <b>Mentés</b> gombra nem koppintasz. Ha meggondoltad magad, az{' '}
            <b>Elvetés</b> mindent visszaállít.
          </p>
          <Shot file="terv-uj-sav.jpg" alt="Az ágyásba került bokorbab, alul a Mentés gomb" />
        </Step>

        <Step n={5} title="Figyelj a jelzésekre">
          <p>
            Ha valami nem ideális, az ágyás áttekintésében figyelmeztetés jelenik meg. A piros súlyosabb (például a
            paradicsom a tavalyi burgonya helyére került, pedig mindkettő burgonyaféle), a sárga csak figyelmeztet.
          </p>
          <Shot file="terv-figyelmeztetes.jpg" alt="Az 1. ágyás vetésforgó-figyelmeztetésekkel" />
          <p>
            Ilyenkor kiválaszthatod a sávot, és a <b>Mi kerülhetne ide helyette?</b> gombbal másik növényt kérhetsz. A
            paradicsomot másik ágyásba is teheted. Ha mégis így döntesz, az is rendben van: a figyelmeztetés csak jelzés, nem
            tilt semmit.
          </p>
          <p>A <b>Figyelmeztetések</b> lista az egész év jelzéseit egy helyen mutatja.</p>
          <Shot file="terv-figyelmeztetesek-lista.jpg" alt="A Figyelmeztetések lista" />
        </Step>
      </Chapter>

      <Chapter
        id="kertben"
        title="A kertben, telefonról"
        intro="Szezonban az Ez a hét lista a kiindulópont: a következő hét nap teendői napokra bontva, a lemaradtak legfelül, Lejárt címmel."
      >
        <Step n={1} title="Nézd meg, mi a teendő">
          <p>
            Minden sor egy feladat: mit, melyik ágyásban, és alatta egy címke a fajtájával (pl. Helyrevetés, Szoktatás,
            Beszerzés). A feladatok a tervből készülnek, neked nem kell felírnod őket.
          </p>
          <p>
            Ha egy sorban narancssárgával a <b>csúszik</b> szó áll, egy korábbi lépés később történt a tervezettnél, és ez a
            feladat ezért arrébb került.
          </p>
          <Shot file="kert-ez-a-het.jpg" alt="Az Ez a hét lista telefonon" phone />
        </Step>

        <Step n={2} title="Pipáld ki, amit megcsináltál">
          <p>
            Koppints a sor elején lévő körre. Vetésnél, kiültetésnél és betakarításnál ezzel azt is rögzíted, hogy ma történt.
            Ha később történt, mint tervezted, a következő lépések ehhez igazodnak.
          </p>
          <p>Ha tévedésből pipáltál, koppints rá újra.</p>
          <Shot file="kert-pipalas.jpg" alt="Kipipált feladat a listában" phone />
        </Step>

        <Step n={3} title="Ha nem ma csinálod meg">
          <p>
            Koppints a sor végén lévő <b>ⓘ</b> gombra. Az <b>Áthelyezve</b> mezőben új napot adhatsz meg. Ha már
            megcsináltad, csak elfelejtetted kipipálni, kapcsold be az <b>Elvégezve</b> kapcsolót, és állítsd be a napját.
            Megjegyzést is írhatsz (pl. „eső miatt halasztva”).
          </p>
          <p>A <b>Kész</b> gombbal mentesz.</p>
          <Shot file="kert-feladat.jpg" alt="Egy feladat részletei: áthelyezés, elvégzés, megjegyzés" phone />
        </Step>

        <Step n={4} title="Saját feladat felvétele">
          <p>
            Ami nem a tervből jön (karók beverése, csigacsapda, komposzt), azt a jobb felső <b>+</b> gombbal veheted fel. Add
            meg, mi a teendő, melyik napon, és ha akarod, melyik ágyásban. Végül koppints a <b>Hozzáadás</b> gombra.
          </p>
          <Shot file="kert-uj-feladat.jpg" alt="Új saját feladat felvétele" phone />
        </Step>

        <Step n={5} title="Termés és megfigyelés">
          <p>
            A betakarítás feladatánál az <b>ⓘ</b> gomb alatt a <b>Termés rögzítése a naplóba</b> lehetőséget választva
            felírhatod, mennyi termett és milyen volt. Ugyanígy rögzíthetsz kártevőt, betegséget vagy bármilyen megfigyelést.
          </p>
          <p>Ezekből jövőre látod, mi vált be, és melyik fajtát érdemes újra vetni.</p>
          <Shot file="kert-termes.jpg" alt="Termés rögzítése a naplóba" phone />
        </Step>

        <Step n={6} title="Nézz rá egy ágyásra">
          <p>
            A <b>Kertem</b> listából bármelyik ágyást megnyithatod, és megnézheted, mi van most benne, és mi jön utána.
            Telefonon is módosíthatsz, de a nagyobb átrendezés gépen kényelmesebb.
          </p>
          <Shot file="kert-agyas.jpg" alt="Egy ágyás telefonon" phone />
        </Step>
      </Chapter>

      <Chapter
        id="bevasarlas"
        title="Bevásárlólista"
        intro="Külön bevásárlólista nincs. A terv alapján az alkalmazás magától jelzi, mit kell beszerezni: a feladatok között, Beszerzés címkével."
      >
        <Step n={1} title="Honnan tudja, mit kell venni">
          <ul>
            <li>
              <b>Vetőmag:</b> ha a tervben szereplő fajtából nincs a Vetőmagkészletben, kb. három héttel az első vetés előtt
              megjelenik a beszerzése.
            </li>
            <li>
              <b>Palánta:</b> ha vásárolt palántát terveztél, három nappal a kiültetés előtt jelzi, hogy meg kell venni.
            </li>
          </ul>
        </Step>

        <Step n={2} title="Írd össze">
          <p>
            Az <b>Ütemezett</b> lista az egész évet mutatja, hónapok szerint. A <b>Beszerzés</b> címkéjű sorok együtt adják a
            listát: mit, melyik ágyáshoz, és mikor lesz rá szükség.
          </p>
          <Shot file="bevasarlas-utemezett.jpg" alt="Az Ütemezett lista a Beszerzés feladatokkal" />
          <p>
            Ha egyben szeretnéd látni az évet, nyisd meg a <b>Naptár</b> <b>Év</b> nézetét, és a fenti címkék közül csak a{' '}
            <b>Beszerzés</b> maradjon bekapcsolva.
          </p>
          <Shot file="bevasarlas-naptar-ev.jpg" alt="A Naptár éves nézete csak a beszerzésekkel" />
        </Step>

        <Step n={3} title="Nézd meg a részleteket">
          <p>
            A beszerzés <b>ⓘ</b> gombja megmutatja, melyik ültetéshez kell, és mikor lesz az első vetés. Innen egy
            koppintással a <b>Vetőmagkészlet</b> is megnyílik.
          </p>
          <Shot file="bevasarlas-feladat.jpg" alt="Egy vetőmag-beszerzés részletei" />
        </Step>

        <Step n={4} title="Ha megvetted, vedd fel a készletbe">
          <p>
            A <b>Vetőmagkészlet</b> oldalon a jobb felső <b>+</b> gombbal vehetsz fel új tételt. Válaszd ki a növényt és a
            fajtát, és írd be az évjáratot (a tasakon áll). A <b>Kész</b> gombbal mentesz.
          </p>
          <Shot file="bevasarlas-keszlet.jpg" alt="A Vetőmagkészlet oldal" />
          <Shot file="bevasarlas-uj-mag.jpg" alt="Új vetőmag felvétele" />
          <Note title="Miért kell az évjárat?">
            A magok csak néhány évig csíráznak jól. Az alkalmazás az évjáratból kiszámolja, meddig használható a tétel, és
            szól, ha lejár.
          </Note>
        </Step>

        <Step n={5} title="A tétel lekerül a listáról">
          <p>
            Amint a mag bekerül a készletbe, a beszerzése magától eltűnik a feladatok közül. A palánta beszerzését egyszerűen
            pipáld ki, amikor megvetted.
          </p>
          <Shot file="bevasarlas-utana.jpg" alt="Az Ez a hét lista: a paprikamag beszerzése már nincs benne" />
        </Step>
      </Chapter>

      <p className={s.footer}>
        Ha elakadtál, vagy valami nem úgy működik, ahogy itt áll, szólj annak, aki a Kerttervezőt a gépen futtatja. Az
        adatokról rendszeresen automatikus mentés készül.
      </p>
      <p className={s.footer}>
        A videó zenéje: „Morning” – Kevin MacLeod (incompetech.com), Creative Commons: Nevezd meg! 4.0 (CC BY 4.0) licenc.
      </p>
    </div>
  );
}
