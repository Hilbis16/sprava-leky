# Aktuální stav a předání práce

Aktualizováno: 2026-10-22. Tento soubor eviduje stav, neuděluje souhlas k dalším úpravám.

## Priorita uživatele

**Nejprve dokončit a ověřit aplikaci, nasazení řešit až jako poslední krok.** Uživatel zatím nemá server ani doménu. Nevybírat ani neobjednávat hosting během dokončování funkcí.

## Dokončeno

- Migrace ze Supabase na vlastní Fastify API a PostgreSQL. Telefon zachovává SQLite kv-store, web localStorage. Přihlášení používá uživatelem zvolený jednorázový kód do e-mailu, web HttpOnly cookie a mobil SecureStore.
- Role a izolace rodin, jednorázové pozvánky, evidence mutací, atomická synchronizace s revizemi a řešením konfliktů. Klient odesílá nejvýše 500 změn a přehrává neodeslanou frontu nad snapshotem.
- Prázdné nové účty, úložiště podle účtu, potvrzovaný import původních dat bez smazání původní kopie. Neúplná lokální data neobnovují potichu demo.
- Push worker s outboxem a kontrolou členství/session. Vývojový Compose, konfigurační příklady a export/import starého serveru jsou připravené; nejsou nasazené.
- **Opraveny připomínky kúry.** Omezené a budoucí rozvrhy používají konkrétní termíny, respektují začátek a poslední den včetně. Běžné dlouhodobé rozvrhy zachovávají týdenní opakování. Stejný čas sdílí jedno obecné upozornění bez názvů léků.
- Společný plán nejvýše 56 dávek a osmi upozornění na zásoby. Dlouhé plány ukazují termín doplnění v rodinné i seniorské obrazovce. Obnova po načtení, změně dat, návratu do popředí, o půlnoci a před vyčerpáním kapacity za běhu aplikace. Ruší staré neomezené spouštěče i připomínky předchozího účtu.
- **Opraveny všechny tři schválené nálezy kontroly.** Formuláře a API sdílejí schémata v `src/domain/validation.ts`. Neplatná čísla, přesnost a překročené délky se odmítají před reducerem/frontou; formuláře při odmítnutí neopouštějí editaci ani nehlásí úspěch. Zápis SQLite i webu ověřuje stav a odmítá také nekonečná čísla v payloadech, takže nepřepíše poslední čitelnou kopii. Oprava neprovádí automatické mazání starších dat ani front.
- Plánování nyní počítá unikátní skutečné termíny už při hledání další dávky. Sloučení 02:00/03:00 při jarním přechodu času neztratí termín doplnění. Obsluha chyb API se registruje před pluginy, takže odmítnutí neplatné dávky vrací HTTP 400 místo 500.
- **Opraveny oba nálezy průchodu UI.** Společné `showMessage` používá webový dialog i nativní dialog telefonu; všechny jednoduché zprávy v obrazovkách a AppState převedeny. Otázka po odeslání žádosti používá `confirmAction` a zachovává volbu „Zatím ne“. Po odmítnutí pozvánky, výpadku či chybě zápisu skončí stav připojování chybovou zprávou; předběžné neodeslané změny operaci vůbec nespustí.
- Supabase SDK odstraněno, supabase/ zachováno jako archiv. Původní smazání README.md a CLAUDE.md zachována. AGENTS.md během implementace nebyl měněn.

[Architektura](ARCHITECTURE.md) · [Vývoj a ověřování](DEVELOPMENT.md) · [Migrace](MIGRATION.md) · [Budoucí provoz](OPERATIONS.md)

## Ověření

- Prošlo **90 klientských testů** a **14 integračních testů** na skutečném dočasném PostgreSQL. Windows sandbox blokoval initdb; úspěšný běh použil schválené spuštění mimo sandbox a vlastní testovací databázi.
- Prošly typové kontroly klienta i serveru, ESLint a webový export. Android export včetně Hermes bytecode prošel při předchozí úpravě připomínek do .cache/native-export; v tomto kroku nebyl opakován. Export není instalovatelný build ani důkaz doručení na telefonu.
- Simulace Expo ověřuje poslední den, budoucí začátek, staré spouštěče, zamítnutá oprávnění, opakované otevření, zkrácení kúry, doplňování kapacity, částečné selhání OS a souběh s odhlášením.
- Nové regrese ověřují odmítnutí `1e309`, Infinity/NaN, čísel mimo rozsah a přesnost, jména o 121 znacích i limitů kontaktů; správné přijetí hraničních hodnot a desetinné čárky. Obě úložiště se simulovanou perzistencí zachovají původní kopii a dovolí následně uložit opravu. PostgreSQL ověřuje atomické odmítnutí smíšené dávky i následný platný zápis.
- Regrese změny času běží v Europe/Prague: od 28. 3. 2026 do 30. 6., časy 02:00/03:00/08:00. Plán má 56 unikátních termínů do 15. 4. a správně vrací doplnění před 16. 4. v 02:00; kratší kompletní kúra doplnění nehlásí.
- **Proveden průchod UI v izolovaném Chrome**, mobil 390 × 844 a desktop 1440 × 844, proti dočasnému skutečnému PostgreSQL a API na localhost. Prošlo OTP přihlášení/chybný kód, prázdný účet, osoba a kontakt, lék/úprava/kúra, zásoby, dávka a historie, senior/PIN na webu, návrh a stavy žádosti, offline fronta a následné odeslání, přepnutí dvou účtů a obnova stránky. Ověřena tvorba QR a přijetí pozvánky přes UI v druhém účtu; opakované použití API odmítlo HTTP 400. Vybrané snímky byly vizuálně prohlédnuté. Podrobnosti a omezení: [QA.md](QA.md).
- Po opravě opakovány regresní scénáře v reálném Chrome: prázdné jméno i `1e309` zobrazí konkrétní text v dialogu a dovolí opravu. Pozvánka při vypnuté síti zobrazí chybu, po obnovení připojení se přijme a použitý odkaz správně vrátí HTTP 400 s viditelným důvodem. Po návratu do přehledu zůstane dokončený chybový stav, nikoli „Připojuji rodinu…“. Testovací účty byly syntetické, e-maily zachycené lokálně.

## Zbývá před dokončením aplikace

1. **Ověřit skutečný telefon** podle DEVELOPMENT.md: OCR, oprávnění a fyzické doručení připomínek, změna kúry, odhlášení, nativní dialogy a PIN. Uživatel uvedl, že teď nemá telefon k testování. Bez zařízení nelze tuto část uzavřít.
2. **Ověřit skutečné systémové sdílení a skenování QR** na telefonu. Přijetí pozvánky přes web je ověřené; žádná skutečná žádost lékaři nebyla odeslána.

Tři původní nálezy i oba navazující nálezy UI jsou opravené a ověřené. Telefonní část zůstává otevřená kvůli chybějícímu zařízení; nasazení nadále až nakonec.

## Provoz až nakonec

Žádný hosting nebyl objednán, vzdálená data nebyla přenesena. Docker zde není dostupný; ověřena pouze syntaxe Compose. SMTP a Expo v testech používají simulaci. Pro budoucí veřejný provoz bude potřeba HTTPS, skutečné SMTP/Expo projectId, zálohy a ověření obnovy. Zavřená aplikace sama nedoplňuje dlouhé omezené lokální plány; musí se otevřít před zobrazeným termínem. Přesnost doručení omezuje nastavení OS. Synchronizace přenáší celé snapshoty, zátěž nebyla změřena.
