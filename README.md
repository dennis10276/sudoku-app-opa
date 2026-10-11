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
