# Architektura projektu

„Moje léky“ používá Expo / React Native, vlastní HTTP API a PostgreSQL. Telefon uchovává pracovní kopii v SQLite kv-store; web používá localStorage. [Pravidla](../AGENTS.md) · [Vývoj](DEVELOPMENT.md) · [Stav](STATUS.md)

## Mapa repozitáře

| Cesta | Odpovědnost |
| --- | --- |
| `src/app/` | Expo Router, obrazovky, hlavní záložky v `(tabs)/`. |
| `src/components/`, `src/theme.ts` | Sdílené UI; potvrzení akcí přes `confirmAction`. |
| `src/state/AuthState.tsx` | E-mailový kód, session a oddělené demo. |
| `src/state/AppState.tsx` | Stav AppData, lokální akce a fronta změn. |
| `src/state/acceptInvite.ts` | Přijetí rodiny, zachování místních změn a dokončení průběhového stavu při úspěchu i chybě. |
| `src/domain/` | Čistá logika rozvrhu, zásob, historie, receptů a mutací. |
| `src/domain/validation.ts` | Společná schémata a limity formulářů, lokálních mutací a API; kopíruje se také do serverového image. |
| `src/data/` | HTTP klient, úložiště podle účtu, import a slučování snapshotů. |
| `src/services/` | OCR a notifikace; Metro vybírá .native.ts / .web.ts. |
| `server/src/` | Fastify API, Better Auth, oprávnění, PostgreSQL, push worker a převod dat. |
| `server/migrations/` | Verzované SQL chráněné kontrolními součty. |
| `server/test/` | Integrace se skutečným samostatným PostgreSQL. |
| `supabase/` | Archiv původních migrací a funkcí; aplikace jej nepoužívá. |

Klientské testy *.test.ts leží vedle zdrojů. .expo/, .cache/, dist/ a coverage/ jsou generované.

## Přihlášení a oprávnění

Better Auth posílá šestimístný kód s platností pět minut. Web má HttpOnly cookie, telefon session token v SecureStore. API ověřuje session, očekávaný účet a členství. PostgreSQL není dostupný klientovi.

Vlastník a pečující upravují léčebné záznamy; senior potvrzuje a vrací potvrzení dávek. Odstranění profilu vlastníkem smaže jeho data, ostatní opustí členství. activeRole a PIN řídí zobrazení, nepřidělují oprávnění. Pozvánky mají jednorázový token, hash v databázi a platnost 24 hodin.

## Tok změny dat

1. Akce vytvoří PendingMutation a ověří celou dávku společným schématem před reducerem i vložením do fronty. Neplatný vstup zůstane ve formuláři s chybovou zprávou. Úložiště navíc kontroluje čitelnost stavu a konečnost všech čísel před přepsáním poslední kopie.
2. /v1/sync ověří požadavek a revize profilů; změny zapíše v jedné transakci.
3. Evidence ID a hashe obsahu zabraňuje dvojímu zápisu. Konflikt ponechá frontu v zařízení a nabídne výslovné řešení.
4. Server vrátí dostupné rodinné snapshoty. applySync.ts přehraje zbývající frontu včetně změn vzniklých během přenosu. Klient odesílá nejvýše 500 změn v jednom požadavku. Zrušená členství ani odstraněné profily ve staženém stavu nezůstávají.

Synchronizace běží po načtení, při návratu do popředí, tři sekundy po změně a opakovaně po minutě. Přenáší celé snapshoty. Nový účet je prázdný; původní místní data se importují pouze potvrzenou akcí. Chyba úložiště účtu nesmí potichu obnovit demo.

Chybová a informační hlášení volají `showMessage` z `src/components/message.ts`: web zobrazí dialog prohlížeče, telefon nativní `Alert`. Volby s odpovědí používají `confirmAction`; přímý `Alert.alert` v obrazovkách na webu nefunguje.

## Důležité vazby

- Nová mutace vyžaduje sladit typy, reducer, serverovou validaci a zápis. Databázová ID entit jsou UUID.
- Zásoba vychází z inventurních událostí a minulých plánovaných dávek. Změna rozvrhu začíná dnes a korekční událost zachovává odhad zásoby.
- endsOn je poslední den léčby včetně. ID dávky tvoří ID léku a ISO čas; klientský a serverový výpočet musí souhlasit.
- OCR pouze předvyplňuje potvrzovaný formulář. eRecept ukládá dvanáctiznakový identifikátor.
- Worker každou minutu kontroluje nepotvrzené dávky, členství a session zařízení. Obecná upozornění eviduje outbox.

## Lokální připomínky

`reminderPlan.ts` sestavuje společný plán celého zařízení. Kúry s `endsOn` a dosud nezačaté rozvrhy používají konkrétní jednorázové termíny. Běžné již zahájené dlouhodobé rozvrhy používají týdenní opakování. Více léků ve stejný čas sdílí jedno obecné upozornění; žádný text neobsahuje názvy léků.

Rozpočet aplikace je nejvýše 56 připomínek dávek a osm upozornění na zásoby. Pokud celý plán nelze uložit, přednost mají nejbližší termíny. Rodinná i seniorská obrazovka ukážou, před kterým časem je nutné aplikaci otevřít pro doplnění. Velké množství různých týdenních časů přechází na omezený plán konkrétních termínů.

Kapacita konkrétních termínů se počítá až po sloučení stejných skutečných časů. Při jarním přechodu může například neexistující 02:00 splynout s 03:00; i tehdy musí plán uchovat první neuložený termín pro upozornění na doplnění.

`useLocalReminders.ts` obnovuje plán po načtení a změně dat, při návratu do popředí, o půlnoci a před vyčerpáním uložených termínů za běhu aplikace. Nativní operace jsou ve společné frontě; novější stav má přednost. Obnova odstraní i staré neomezené spouštěče. Při odhlášení vyčistí spravované připomínky předchozího účtu. Zavřená aplikace sama termíny nedoplňuje; dlouhé omezené kúry proto vyžadují otevření před zobrazeným termínem.
