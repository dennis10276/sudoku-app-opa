# Sudoku voor opa

Klassieke Sudoku in het Nederlands, zonder reclame. Werkt als web-app: open de pagina in Safari op de iPhone/iPad en kies **Deel → Zet op beginscherm**. Daarna opent het schermvullend met een eigen icoon en werkt het ook zonder internet.

**Speel:** https://dennis10276.github.io/sudoku-app-opa/

## Functies
- Zes niveaus: Makkelijk, Gemiddeld, Moeilijk, Expert, Meester, Extreem
- Dagelijkse uitdaging met kalender en maandtrofee
- Notities (potloodstreepjes), Wissen, onbeperkt Ongedaan maken
- Hint die een vakje invult en uitlegt waarom ("In deze rij kan de 5 alleen nog hier.")
- Fouten worden rood; na 3 fouten is het spel voorbij, met een tweede kans
- Markeren van rij/kolom/blok, dezelfde getallen en dubbele getallen
- Score, tijd met pauzeknop, statistieken per niveau (gespeeld, gewonnen, beste tijd, reeksen)
- Instellingen: grote cijfers, licht/donker, geluid, tijd tonen, fouten tonen, foutenlimiet, notities vanzelf weghalen, gebruikte getallen verbergen
- Staand en liggend scherm, iPhone en iPad; ook te spelen met het toetsenbord (1–9, pijltjes, Backspace, N, H)
- Spel wordt automatisch bewaard

## Puzzels
`puzzles.js` bevat per niveau 260 puzzels met precies één oplossing, gemaakt met `tools/generate.js` en ingedeeld op de technieken die nodig zijn om ze op te lossen (`core.js`):
- Makkelijk / Gemiddeld: alleen "enige mogelijkheid" (Makkelijk ±37 cijfers gegeven, Gemiddeld ±30)
- Moeilijk: paren en uitsluiten binnen een blok
- Expert: drietallen, X-wing, swordfish, XY-wing
- Meester / Extreem: vragen om vooruitdenken ("als hier een 3 staat, loopt het vast")

Elke puzzel wordt bij het starten willekeurig omgezet (cijfers verwisseld, rijen/kolommen binnen een band geschud, gespiegeld), zodat geen twee spellen hetzelfde ogen. De dagelijkse uitdaging is voor iedereen op dezelfde dag dezelfde.

Nieuwe puzzels maken: `node tools/generate.js deel.json 65` (een paar keer met verschillende `SEED=`), daarna `node tools/merge.js puzzles.js deel*.json`.

## Bestanden
- `index.html`, `style.css`, `game.js` – het spel
- `core.js` – oplosser en moeilijkheidsbepaling
- `puzzles.js` – de puzzels
- `manifest.webmanifest`, `sw.js`, `icons/` – beginscherm-icoon en offline werken

Bij een nieuwe versie: verhoog `CACHE` in `sw.js` (en `?v=` in `index.html`) zodat iPhones de update meteen ophalen.

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
