# A ZimaOS-szerver előkészítése

Ezeket a lépéseket egyszer kell elvégezni. Utána a telepítést, a mappákat és a kiadásokat a Macről, parancsokkal végezzük; a ZimaOS felületén nem kell mást beállítani.

Kb. 20–30 perc. Kell hozzá: a szerver bekapcsolva a hálózaton, a Mac ugyanazon a Wi-Fin, és a router kezelőfelületének jelszava.

---

## 1. Állandó cím a szervernek (a routerben)

**Miért:** a telefon és a kiadó parancsok egy címen keresik a szervert. Ha a router újraindítás után más címet ad neki, semmi nem találja meg.

1. Nyisd meg a ZimaOS felületét a böngészőben, ahogy eddig is. A címsorban látszik a szerver IP-címe, pl. `192.168.1.50`. Írd fel.
2. Lépj be a router kezelőfelületére (általában `192.168.1.1`, a jelszó a router alján vagy a szolgáltató levelében van).
3. Keresd meg a „DHCP”, „LAN” vagy „Csatlakoztatott eszközök” menüt, és ott a szervert (a neve valószínűleg `ZimaOS` vagy `zimaos`).
4. Állítsd be neki a **címfoglalást** (angolul *DHCP reservation* vagy *static lease*): a router mindig ugyanazt az IP-címet adja neki. Mentsd el.

Ha nem találod a menüt, írd meg a router típusát, és megmondom, hol van.

## 2. SSH bekapcsolása a ZimaOS-en

**Miért:** az SSH-val a Macről biztonságosan, parancsokkal tudom kezelni a szervert (mappák, indítás, frissítés).

1. A ZimaOS felületén nyisd meg a **Beállításokat** (Settings).
2. Keresd meg a **Fejlesztői mód** (Developer Mode) részt.
3. Kapcsold be az **SSH-hozzáférést** (SSH Access → On).

A menük neve verziónként kicsit eltérhet; ha nem találod, küldj róla egy képernyőképet.

## 3. Belépés jelszó nélkül a Macről (SSH-kulcs)

**Miért:** így a kiadó parancsok nem kérnek minden alkalommal jelszót. A kulcs a Macen marad; a szerver csak a „lakat” felét kapja meg.

Nyisd meg a Macen a **Terminál** alkalmazást (Spotlight: `Terminál`), és futtasd sorban az alábbi parancsokat. A `FELHASZNALO` helyére a ZimaOS-be belépéshez használt felhasználóneved, az `IP` helyére az 1. lépésben felírt cím kerül.

Kulcs készítése (a kérdéseknél csak nyomj Entert; jelmondatot nem kell megadni):

```bash
ssh-keygen -t ed25519 -C "kerttervezo-mac"
```

A kulcs átmásolása a szerverre (egyszer kéri a ZimaOS-jelszavadat; az első csatlakozáskor a „yes” választ is be kell írni):

```bash
ssh-copy-id FELHASZNALO@IP
```

Próba (most már jelszó nélkül kell működnie, és kiírja a Docker verzióját és a ZimaOS alkalmazásait):

```bash
ssh FELHASZNALO@IP "docker --version; casaos-cli app-management list apps"
```

Ha a próba „permission denied” hibát ad a Dockerre, próbáld meg így is:

```bash
ssh FELHASZNALO@IP "sudo docker --version"
```

## 4. GitHub: jogosultság a munkafolyamathoz

**Miért:** az image-et a GitHub építi. A munkafolyamat-fájl feltöltéséhez a `gh` eszköznek külön engedély kell.

A Terminálban:

```bash
gh auth refresh -h github.com -s workflow
```

Megnyílik a böngésző, és a GitHub egy kódot kér, amelyet a Terminál ír ki. Másold be, és hagyd jóvá.

## 5. GitHub: a csomag nyilvánossá tétele (az első építés után)

**Miért:** így a szerver bejelentkezés nélkül le tudja tölteni az image-et. Csak a kód van benne, adat nincs; a forráskód amúgy is nyilvános.

Ezt akkor csináld meg, amikor szólok, hogy az első image elkészült:

1. Nyisd meg: `https://github.com/aszakaly?tab=packages`, és kattints a **garden-planner** csomagra.
2. Jobb oldalt **Package settings**.
3. Lent a „Danger Zone” részben **Change visibility** → **Public**, és erősítsd meg a csomag nevének beírásával.

---

## Amit küldj vissza

- a szerver IP-címét (1. lépés),
- a ZimaOS-felhasználónevedet (a jelszót ne),
- a 3. lépés próbaparancsának kimenetét (bemásolva), vagy a hibaüzenetet.

Ezek után én folytatom: létrehozom a mappákat, feltelepítem a két példányt, és szólok, amikor a teszt elérhető a telefonon a `http://IP:4322` címen.
