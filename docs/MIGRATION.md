# Migrace na vlastní API a PostgreSQL

Uživatel schválil migraci 2026-10-21. Cílem je standardní PostgreSQL na serveru, vlastní API a zachování SQLite kv-store v mobilu. Nasazení k externímu poskytovateli ani nákup služeb nejsou součástí změny.

## Plán implementace — dokončeno v repozitáři

1. Vytvořit samostatný TypeScript backend: Fastify, PostgreSQL, verzované SQL migrace a přihlášení přes Better Auth jednorázovým kódem do e-mailu podle volby uživatele. Připravit Docker Compose a konfigurační příklady bez skutečných tajných údajů.
2. Nahradit Supabase RPC serverovými operacemi s validací, kontrolou členství a rolí, transakcemi a evidencí provedených mutací. Převést jednorázové pozvánky a serverová upozornění.
3. Převést mobilní/webový klient na HTTP API. Zachovat lokální úložiště, izolovat data podle účtu, přidat registraci/přihlášení a výslovný import dosavadních lokálních dat. Nové účty začínají prázdné.
4. Ověřit migrace, autentizaci, izolaci rodin, opakování mutací, konflikty dvou klientů a přežití změn vzniklých během synchronizace. Spustit typové kontroly, testy, lint a webový build. Aktualizovat architekturu, provozní návod a předávací stav.

Výsledky a omezení ověření jsou v [STATUS.md](STATUS.md). Dokončení implementace neznamená spuštění produkční služby ani přenos vzdálené databáze.

## Rozhodnutí

- API se verzováním `/v1`; přihlášení obsluhuje Better Auth pod `/api/auth`.
- Jednorázový šestimístný kód do e-mailu, platnost pět minut a nejvýše tři pokusy. Web používá HttpOnly cookie; nativní klient ukládá session token v SecureStore. Hesla aplikace nepoužívá.
- API kontroluje role u každé operace; senior potvrzuje dávky, vlastník a pečující upravují léčebné záznamy. Role klientského zobrazení není autorizační údaj.
- Změny jednoho synchronizačního požadavku jsou atomické. Opakovaná mutace má stejné ID a obsah; již provedená operace se neopakuje.
- Revize profilu odhalí souběžné úpravy. Konflikt zachová lokální frontu a vyžádá volbu mezi stavem serveru a výslovným opětovným odesláním lokálních změn. Čas klienta neurčuje pořadí zápisů.
- Databázový účet a přístupové údaje zůstávají na serveru. Mobil zná pouze veřejnou URL API.
- Staré lokální úložiště se automaticky nemaže ani nenahrává. Přenos do přihlášeného účtu je samostatná potvrzená akce.

## Hranice

Původní Supabase SQL zůstává jako archiv. Přenos vzdálené databáze nebyl proveden: nejsou dodané přístupové údaje ani cílové prostředí. Nativní notifikace a skutečné doručení e-mailů vyžadují samostatné ověření. Chyba lokálních připomínek po konci kúry byla opravena v následném schváleném kroku; aktuální ověření je v [STATUS.md](STATUS.md). Uživatel požaduje nejprve dokončit aplikaci a nasazení řešit až naposledy.

## Přenos dat ze zařízení

Po přihlášení do prázdného účtu otevřete Rodina → Přenést původní data ze zařízení. Potvrzení výslovně upozorňuje na případná demo data. Přenese se historie, zásoby i kontakty; původní kopie zůstává. Při výpadku se opakuje stejná uložená fronta. Původní anonymní členství se nepřenášejí; importující účet se stane vlastníkem a ostatní znovu pozve.

## Přenos existujícího Supabase serveru

Nejprve vytvořte úplnou zálohu a zastavte staré zápisy i plánovač. Exportní nástroj očekává schéma po všech původních migracích v `supabase/migrations/`. Pracuje v konzistentní transakci pouze pro čtení. Do serverového prostředí bezpečně dodejte `LEGACY_DATABASE_URL`; nezapisujte ho do verzovaných souborů ani historie příkazů.

Z kořene, s existujícím adresářem `.cache/`:

```sh
npm run legacy --workspace server -- export --output ../.cache/legacy.json
```

V novém backendu se každý cílový uživatel nejprve přihlásí e-mailovým kódem. Aplikační databáze musí zůstat prázdná. Do `.cache/user-map.json` připravte objekt `{"původní-uuid-uživatele":"ověřený-email@example.cz"}` pro všechna členství i autory záznamů. Anonymní účty nelze bezpečně přiřadit podle jména; mapování ověřte s vlastníkem dat.

Nastavte `DATABASE_URL` nového cíle v `server/.env`. Nejprve spusťte zkoušku, která skutečné zápisy vrátí zpět:

```sh
npm run legacy --workspace server -- import --file ../.cache/legacy.json --mapping ../.cache/user-map.json
```

Po ověření počtů spusťte stejný příkaz s `--apply`. Import je atomický, zachovává ID a kalendářní data; odmítne neprázdný cíl, chybějící mapování, neověřené účty nebo neplatné vazby. Duplicitní rozvrhy jednoho léku či kolize sloučených členství vyřešte předem v kontrolované kopii exportu. Hesla, staré session, zařízení, pozvánky a evidenci původních mutací nepřenáší.

Export i mapování obsahují citlivá data. Uchovávejte je chráněně, mimo Git a veřejný web; po převodu je zpracujte podle retenčních pravidel. Ověřte počty záznamů, členství, historii a dvě zařízení před odstavením původní služby. Návrat a zálohování popisuje [OPERATIONS.md](OPERATIONS.md).
