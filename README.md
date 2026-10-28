# Sudoku voor opa

Klassieke Sudoku in het Nederlands, zonder reclame. Werkt als web-app: open de pagina in Safari op de iPhone/iPad en kies **Deel → Zet op beginscherm**. Daarna opent het schermvullend met een eigen icoon en werkt het ook zonder internet.

**Speel:** https://dennis10276.github.io/sudoku-app-opa/

## Functies
- **Levels** in plaats van moeilijkheidsgraden: begin bij level 1, elk level is een heel klein beetje moeilijker. Opa ziet alleen zijn levelnummer, nooit hoe moeilijk een puzzel is. De 3869 puzzels staan in één rij van makkelijk naar extreem, met een heel geleidelijke overgang; daarna gaat het eindeloos door.
- **Punten**, zonder tijdsdruk. Bij elk goed getal zweeft een "+x" omhoog met de reden eronder:
  - goed getal: 10 punten (elke 100 levels 1 meer)
  - reeks: elk volgend goed getal zonder fout 2 extra, tot 20 extra; een fout begint de reeks opnieuw
  - rij, kolom of blok vol: +30 · alle 9 van een getal: +50
  - level klaar, geen enkele fout, geen hints: elk 10× de punten per getal
  - hints geven geen punten; de tijd telt nooit mee
- **Sterren** per level: ★ opgelost, ★★ hooguit één fout, ★★★ geen fouten en geen hints. Elke 50 levels een **medaille**.
- **Puntenbon** na elk level: de opgeloste puzzel licht op bij elke regel (welke getallen, welke reeks, welke rijen/kolommen/blokken), met sterren, record, totaalscore en de weg naar de volgende medaille. Tikken slaat de animatie over.
- Opnieuw spelen van een level kan altijd; alleen een betere score telt mee in het totaal.
- Twee keer verloren op hetzelfde level? Dan mag je het overslaan.
- **Ranglijst** op het startscherm: op welk level de familie staat ("Nog 5 levels en je haalt Dennis in!"). Iedereen die Sudoku speelt en in het speeloverzicht een naam heeft gekregen, staat erin; apparaten met dezelfde naam zijn één persoon, namen met "test" worden overgeslagen. Het eigen level komt altijd van het eigen toestel.
- **Dagelijkse uitdaging** met kalender, afgestemd op je eigen level.
- Groot, vet en contrastrijk bord: het bord loopt bijna van rand tot rand, cijfers vullen het vakje; notities staan precies in het midden van hun plekje. "Extra groot" in de instellingen.
- Notities, Wissen, onbeperkt Ongedaan maken, Hint met uitleg ("In deze rij kan de 5 alleen nog hier.")
- Fouten worden rood; na 3 fouten is het spel voorbij, met een tweede kans
- Tijd staat standaard uit (aan te zetten in de instellingen)
- Staand en liggend scherm, iPhone en iPad; ook te spelen met het toetsenbord (1–9, pijltjes, Backspace, N, H)
- Spel en voortgang worden automatisch bewaard. Een puzzel van vóór deze versie kan nog worden afgemaakt ("Oude puzzel").

## Puzzels
`puzzles.js` wordt gemaakt met `node tools/build-levels.js` uit deze bronnen in `tools/data/`:
- `generated.js`, `generated2.js` en `extra.txt`: eigen puzzels (`tools/generate.js`, `tools/generate-extra.js`)
- `collection.txt`: 626 vrij te gebruiken puzzels (Public Domain / CC0) uit de "Free to Use Sudoku Puzzle Collection" (SudokuEngine)

Elke puzzel heeft precies één oplossing en wordt ingedeeld op de technieken die nodig zijn (`core.js`): alleen "enige plek", paren, drietallen/X-wing/XY-wing, korte ketens, langere ketens. Binnen een groep gaat het van veel naar weinig gegeven cijfers. Levels 1–1000 zijn alleen "enige plek"-puzzels, gerangschikt op hoeveel vakjes je meteen aan het begin kunt invullen: level 1 begint bij 25 (de 93 nog makkelijkere puzzels zijn weggelaten), level 1000 eindigt bij ±9. De puzzels in dat bereik zijn gelijkmatig over de 1000 levels verdeeld. De eerste puzzel met een paar is level 1001 (`START_FILL`, `END_FILL`, `FIRST` in `tools/build-levels.js`). De groepen volgen elkaar op met lange overgangen: over honderden levels groeit het aandeel van de volgende soort heel geleidelijk van 0% naar 100%.

| Levels | Wat |
| --- | --- |
| 1–1000 | alleen "enige plek"; aan het begin 25 → ±9 vakjes meteen in te vullen, ±39 → ±31 gegeven cijfers |
| 1001–±1800 | steeds vaker een puzzel waarbij paren helpen (level 1001 is de eerste) |
| ±1800–3000 | geleidelijk drietallen, X-wing, XY-wing, korte ketens |
| ±3000–3869 | de moeilijkste |
| 3870+ | de laatste 1000 opnieuw, steeds anders omgezet |

De dagelijkse uitdaging is een puzzel van rond je eigen level, anders omgezet zodat hij er nieuw uitziet (voor iedereen op dezelfde dag dezelfde opzet).

## Bestanden
- `index.html`, `style.css`, `game.js` – het spel
- `core.js` – oplosser en moeilijkheidsbepaling
- `puzzles.js` – de levels en de dagelijkse puzzels
- `tracking.js`, `tracking-config.js` – familieoverzicht (zie hieronder)
- `manifest.webmanifest`, `sw.js`, `icons/` – beginscherm-icoon en offline werken
- `tests/` – `node --test tests/*.test.cjs`

Bij een nieuwe versie: verhoog `CACHE` in `sw.js` (en `?v=` in `index.html`) zodat iPhones de update meteen ophalen.

Het familieoverzicht krijgt per spel nog steeds een moeilijkheidsnaam (`easy` … `extreme`), afgeleid van de soort puzzel (alleen voor het overzicht; in het spel is die nergens te zien). Zo blijven de database-regels en het dashboard van Patience werken.

## Online familieoverzicht

**Dashboard:** https://dennis10276.github.io/Patience-app-opa/dash/?game=sudoku

Sudoku wordt automatisch bijgehouden in dezelfde kleine Firebase-database als Patience. Opa hoeft
niets aan te zetten. Kies de speler en het spel in het dashboard; **Alle spellen** toont beide samen.
Waar browseropslag gedeeld is, gebruiken beide apps dezelfde apparaatcode en naam. Een afzonderlijke
browser of geïnstalleerde webapp met eigen opslag verschijnt als apart apparaat.

Eén compact record per speelmoment bevat begintijd, laatste activiteit, actieve seconden, begonnen
puzzels, voltooide puzzels, niveau, dagelijks/normaal, hints en fouten. Er worden geen puzzelroosters,
oplossingen of zetten verzonden. Tracking begint bij de eerste invoer, notitie of hint; alleen openen
of een vakje selecteren maakt geen record. Pauzes, menu's en achtergrondtijd tellen niet mee;
na twee minuten zonder spelinteractie stopt de schatting. Verder spelen telt als nieuw speelmoment,
maar niet als nieuwe puzzel. Een eerder opgeslagen puzzel wordt niet opnieuw als begonnen geteld.

Gegevens verschijnen ongeveer elke 30 seconden. Zonder internet wachten maximaal 500 samenvattingen
op verzending. Als een nieuwe apparaatcode niet blijvend kan worden bewaard, wordt tracking overgeslagen
tot de opslag weer werkt. De geschiedenis begint bij deze update, zonder eerdere lokale statistieken
als sessies te importeren. De hints en fouten in het dashboard zijn actieaantallen en worden niet verminderd
bij Ongedaan of Tweede kans.

Het bestaande openbare toegangsmodel van het Patience-dashboard geldt ook hier: iedereen met het
adres kan spelers en speelgegevens zien en via de API records aanpassen. De regels en centrale dashboardbron
staan in de Patience-repository (`firebase/rules.json` en `dash/`). `tracking-config.js` bevat alleen het
Firebase-adres. De opslagcode `patience.sharing.v1` wordt gedeeld; de wachtrij `sudoku.sessions.v1` en
serviceworkercaches blijven apart. Publiceer de bijgewerkte centrale validatieregels vóór deze Sudoku-versie.

Controle: `node --test tests/*.test.cjs`. Tests draaien de echte spelcode en tracker samen en controleren
eerste invoer/notities, pauzes/menu's, voltooide dagelijkse puzzels, fouten, identiteit, offlineherstel en
middernacht. De serviceworker verwijdert bij updates alleen zijn eigen oude caches.


## Uitgebreide spelinzichten

Het gezamenlijke online dashboard toont nu een periode van 7, 30 of 90 dagen: Nederlandse uren en
weekdagen, typische actieve tijd (mediaan), geobserveerde pogingen, voltooiingen, acties en eindmeldingen.
Een willekeurige pogingcode verbindt pauzes/hervattingen van dezelfde poging; opnieuw beginnen krijgt
een nieuwe code. Een geladen oud spel krijgt een code bij het spelen, zonder historische zetten te importeren.
De vergelijking per spel/niveau is geen definitief winstpercentage: pogingen kunnen later nog worden voltooid.

Elk nieuw sessierecord bevat optioneel `detail` (versie 1): pogingcode, appversie, spelstand, begin/eindvoortgang,
score/spelklok, relevante spelinstellingen, begrensde actietellers, laatste actie/tijd, laatste voortgangstijd,
langste tijd zonder spelactie (maximaal 120 seconden), en een waargenomen eindmelding.
Patience telt kaartverplaatsingen, stapeltrekken/omdraaien, hints, terugzetten, automatisch uitspelen en
kaartacties die geen zet opleverden. Sudoku telt invoer, foutmeldingen, hints, notities, wissen,
terugzetten en tweede kansen. Fouten worden alleen als foutmelding geteld wanneer de foutencontrole aanstaat.
Voortgang is bij Patience het aantal kaarten op de vier stapels boven (van 52); bij Sudoku het aantal
correct ingevulde niet-vooringevulde vakjes. Een nuttige tableauzet hoeft dus geen stijging te geven.

Eindmeldingen onderscheiden winnen, foutenlimiet, geen-zettenmelding, nieuw spel, opnieuw beginnen,
menu, pauze, app verborgen, pagina verlaten, 2 minuten zonder aanraking, onderbroken browsertimer en
herstel na een crash/offlinebezoek. Een daggrens is alleen boekhouding. De app weet niet of iemand moe,
verveeld of gefrustreerd is; het dashboard presenteert patronen als aanwijzingen, niet als oorzaken.
Een plots afgesloten app kan de eindmelding missen; verouderde actieve records krijgen daarom geen
verzonnen stopreden. De tijd van een eindmelding kan de detectietijd zijn, bijvoorbeeld na timeronderbreking.

Alle metingen blijven automatisch en gebruiken dezelfde publieke database en bestaande toegangsregels.
Er is geen apart klikkenlogboek, kaart-/puzzelinhoud, oplossing, schermopname of externe analyticsdienst.
Oude records blijven zichtbaar met hun beperkte gegevens. De uitgebreide metingen beginnen bij deze update.
Elke 30 seconden wordt hetzelfde compacte record vervangen; offline wachtrijen blijven idempotent.
Reken met grofweg 0,5–1 kB ruwe inhoud per uitgebreid blok (afhankelijk van gebruikte acties), exclusief
sleutels en transport. Bij twintig blokken per dag is dat ongeveer 4–8 MB per jaar. Het dashboard laadt
nog steeds maximaal 90 dagen; ouder materiaal wordt niet automatisch uit Firebase verwijderd.


## Compacte speelrecords (detail v2)

Nieuwe metingen gebruiken één record per poging per Nederlandse dag en browsertab. Pauze, menu,
scherm uit en inactiviteit werken hetzelfde record bij als daarna dezelfde poging wordt hervat.
Een herstart of nieuw spel krijgt een nieuwe poging; een daggrens krijgt een nieuw dagrecord.
Een tab bewaart zijn laatst gebruikte record ook bij herladen. Afzonderlijke tabs voegen hun tellers
niet samen, zodat gelijktijdig spelen geen gegevens overschrijft. Zonder sessionStorage werkt de
tracking nog steeds, maar kan herladen een extra record maken.

`detail.stops` bewaart begrensde tellers per waargenomen onderbreking/einde; `detail.hours` bewaart
maximaal 24 actieve-seconden-tellers (`h00`–`h23`, Europe/Amsterdam). Pauzetijd wordt niet verdeeld
over de tussenliggende uren. Alleen de laatste eindmelding houdt een tijdstip; er is geen log per pauze.
Een record blijft ongeveer 0,5–1,5 kB, afhankelijk van het aantal gebruikte tellers. Herhaald pauzeren
dupliceert de metadata niet meer. Elke 30 seconden wordt hetzelfde record bijgewerkt.

Oude records en testspelers worden niet verwijderd of herschreven. Het dashboard accepteert beide
detailversies. Validatie wordt uitgebreid voor de twee begrensde tellerkaarten; lees-/schrijfrechten blijven gelijk.

Het dashboard groepeert de geschiedenis per dag en poging, met compacte grafieken en een uur/weekdag-heatmap zoals Mahjong. De technische meetrecords zijn standaard ingeklapt. Losse oude records zonder pogingcode worden niet op basis van een gok samengevoegd tot één spel.

Automatische browserruns (`navigator.webdriver`) sturen geen speelgegevens of spelersprofielen naar Firebase. Handmatig spelen, inclusief DennisTEST, blijft automatisch gemeten.

## Overzetten en Android

Instellingen → **Voortgang overzetten** heeft twee keuzes:

- **Naar een ander apparaat** toont een link en QR-code (`#overzetten=…`). De code is kort gehouden zodat de
  QR-code makkelijk van een scherm te scannen is: level, punten, sterren per level, dagelijkse uitdagingen van de
  laatste 120 dagen, instellingen en de meetcode (`2…` als tekst of `3…` gecomprimeerd). Scores per level gaan niet mee.
- **Hierheen halen** scant die QR-code met de camera (de ingebouwde QR-lezer van de telefoon als die er is,
  anders jsQR, alleen geladen als je scant), of je plakt de link.

Na bevestiging neemt het spel level, punten, sterren, statistieken, dagelijkse uitdagingen,
instellingen en de meetcode over, zodat het dashboard het als hetzelfde apparaat ziet.
Een half gespeelde puzzel gaat niet mee. Opent iemand de link in Chrome op Android, dan biedt
de pagina ook **In de Android-app openen** aan (`intent://overzetten/<code>`, schema `sudokuopa`).

### Android-app (APK)

`sudoku.apk` (±150 kB, pakket `nl.dennis.sudoku`, versie 1.1 / versionCode 2) is een schermvullende WebView van de live
site, dus updates van het spel komen vanzelf in de app. Bron in `android/`, bouwen zonder Gradle:

```
SUDOKU_KEYSTORE=/pad/sudoku.jks SUDOKU_KEYPASS=… android/build.sh
```

Nodig: Android SDK met `platforms;android-34` en `build-tools;35.0.0`, en de ondertekensleutel
(niet in de repo; bewaard in de map `android-sleutel` naast de lokale kopie). Een update van de
APK moet met dezelfde sleutel worden ondertekend en een hoger `versionCode` hebben.

De app geeft zichzelf aan met `SudokuApp/1` in de user-agent: dan is er geen startpagina, kleurt
de statusbalk mee met licht/donker (`SudokuApp.setBars`) en sluit de terugknop eerst een venster
(`window.__appBack`). De app vraagt cameratoestemming pas bij **Code scannen** en geeft de camera
alleen aan de eigen site. Het knopje **Android** onderaan de startpagina is klein en vaag en wordt niet
getoond op iPhone/iPad of in de app zelf. De service worker laat `.apk` met rust.

QR-codes: `qrcode.js` is qrcode-generator 1.4.4 van Kazuhiko Arase (MIT-licentie); `jsqr.js` is
jsQR 1.4.0 van Cosmo Wolfe (Apache-licentie 2.0), verkleind.

## Testmodus

https://dennis10276.github.io/sudoku-app-opa/?test opent de testmodus (bijv. op de pc): alle levels zijn open,
"Naar level…" (of tik op "Level 1–25") springt naar elk level, "Vul in" maakt het open level af om het
puntenbonnetje te zien, "Stoppen" gaat terug naar het gewone spel. De testmodus bewaart alles apart
(`test:`-sleutels in localStorage) en stuurt niets naar het familieoverzicht of de ranglijst.

## Eén scherm, nooit scrollen

Opa bedient de telefoon met één hand: niets hoeft te scrollen (getest op iPhone SE-formaat, 375 × 647 als
beginscherm-app) en elk scherm heeft een terug- of sluitknop.
- Elk venster heeft rechtsboven een grote ✕; Levels, Dagelijks en Ranglijst hebben linksboven "‹ Start".
- Instellingen is één korte pagina met knoppen naar "Spel", "Markeren", "Spelregels", "Punten", "Overzetten" (elk met "‹ Terug").
- Levels: 25 per pagina (5 × 5, vult het scherm) met ‹ › in plaats van een scrollende rij.
- Spelregels in twee pagina's; Ranglijst met "Jouw cijfers" als knop.
- Start en de lijsten passen zich aan (`fitHome`, `fitList`): eerst compacter, dan minder rijen (wie je moet inhalen blijft staan).
- Het puntenbonnetje in twee stappen: eerst de punten, dan klappen de regels in en verschijnen totaal, ranglijst en knop.

## Ranglijst

Het tabblad **Ranglijst** (vroeger Statistieken) toont iedereen groot onder elkaar: medailles voor de eerste drie,
je eigen rij goud omrand, een balkje naar verhouding van het level, en "Nog 2 levels en je haalt Joop in!".
Je eigen cijfers staan eronder bij "Jouw spel". Na elk level staat de ranglijst ook op het puntenbonnetje (dat
scrolt er vanzelf naartoe); heb je iemand ingehaald, dan staat er "🎉 Je bent Frits voorbij!" (dit apparaat
onthoudt wie er de vorige keer boven je stond, `sudoku.rankSeen`).

Iedereen begint opnieuw bij level 1 sinds de nieuwe levelreeks (build `sudoku-15`, `LEVELS_EPOCH = 3`): bij de
eerste start gaan level, punten, sterren per level en een onafgemaakte levelpuzzel terug naar nul; dagelijkse
uitdagingen en instellingen blijven. De ranglijst en het dashboard tellen alleen levels die met build 15 of nieuwer
gemeld zijn, en overzetcodes van vóór de nieuwe levels worden geweigerd. De vier medespelers (Joop, Marianne,
Frits, Lies) bewegen alleen rond opa's level, ook op andere apparaten; zolang opa's level onbekend is, staan ze niet
in de lijst.
