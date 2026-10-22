# Vývoj a ověřování

[Pravidla](../AGENTS.md) · [Architektura](ARCHITECTURE.md) · [Migrace](MIGRATION.md) · [Provoz](OPERATIONS.md) · [Stav](STATUS.md)

## Spuštění

Používejte Node.js 24 a npm. Na Windows lze použít npm.cmd. Z kořene spusťte `npm ci --legacy-peer-deps`; parametr zachovává kompatibilitu peer závislostí současného Expo projektu.

Bez EXPO_PUBLIC_API_URL funguje lokální demo: `npm run web` nebo `npm start`.

Pro vývoj s účty:

1. Zkopírujte server/.env.example do server/.env. Nahraďte POSTGRES_PASSWORD, stejné heslo v DATABASE_URL a AUTH_SECRET. Náhodnou hodnotu vytvoří `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
2. S Docker Compose v2 spusťte `docker compose --env-file server/.env up --build -d`. Spustí PostgreSQL, migrace, API, worker a lokální Mailpit.
3. Zkopírujte kořenový .env.example do .env; nastavte EXPO_PUBLIC_API_URL=http://localhost:3001. Spusťte `npm run web`.
4. API ověřte na http://localhost:3001/health. Přihlašovací zprávy zachytává Mailpit na http://localhost:8025; neposílá je skutečným adresátům.

Pro běh API přímo v Node spusťte pouze `docker compose --env-file server/.env up -d db mailpit`, potom `npm run server:migrate`, `npm run server:dev` a v dalším terminálu `npm run server:worker`.

Fyzický telefon potřebuje LAN adresu počítače v EXPO_PUBLIC_API_URL i PUBLIC_API_URL. Nastavte API_BIND_ADDRESS=0.0.0.0, mimo Docker také HOST=0.0.0.0. Pro web na LAN přidejte jeho přesný origin do CORS_ORIGINS. Po změně klientské konfigurace restartujte Expo. PostgreSQL ani SMTP nevystavujte do veřejné sítě.

## Příkazy

| Příkaz | Účel |
| --- | --- |
| `npm start`, `npm run web` | Expo a webový náhled. |
| `npm run android` / `npm run ios` | Platformní cíl Expo. |
| `npm run server:dev` / `npm run server:worker` | API / kontrola upozornění. |
| `npm run server:migrate` | SQL migrace cíle určeného server/.env. |
| `npm run typecheck` / `npm run typecheck:server` | Typová kontrola klienta / serveru. |
| `npm test` / `npm run test:server` | Klientské testy / PostgreSQL integrace. |
| `npm run lint` | ESLint aplikace i serveru. |
| `npm run build:web` | Export do dist/. |

Integrační testy vytvářejí vlastní dočasný PostgreSQL na volném lokálním portu. Nepoužívají DATABASE_URL provozní databáze. Vyžadují možnost spustit binární proces; na Windows nemusí fungovat v omezeném sandboxu. Binárky zajišťuje embedded-postgres.

## Konvence a ověření

Striktní TypeScript, dvě mezery, jednoduché uvozovky a středníky podle okolního kódu. Komponenty a typy PascalCase, funkce camelCase; alias @/ míří do src/. Zachovejte názvy tras a platformní varianty. Používejte sdílené UI, téma a confirmAction také pro web.

Zprávy zobrazujte přes `showMessage(title, message)` z `@/components/message`. Pro rozhodnutí použijte `await confirmAction(...)`; odpověď musí řídit navazující akci. `Alert.alert` z react-native-web je prázdná funkce, proto jej nevolejte přímo v obrazovkách. Regrese zpráv a dokončení přijetí pozvánky jsou v `src/components/message.test.ts` a `src/state/acceptInvite.test.ts`.

Testy Vitest pojmenovávejte *.test.ts a ověřujte chování i hraniční případy. Povinný práh pokrytí není nastaven. Před předáním aplikačních změn spusťte obě typové kontroly, obě sady testů, lint a webový export. Nové SQL patří do server/migrations/NNN_popis.sql; aplikované soubory neupravujte.

Kontrakt mutací a limity vstupů upravujte společně v `src/domain/validation.ts`; API jej přímo importuje. Regrese v `validation.test.ts` a `localStore.test.ts` ověřují například `1e309`, hranici 120 znaků jména, desetinnou čárku a zachování čitelné kopie při odmítnutí zápisu. Klientské testy nastavují `TZ=Europe/Prague` před spuštěním workerů, aby test připomínek skutečně zahrnoval změnu času.

OCR a vzdálené push vyžadují development build a fyzické zařízení. Nastavte skutečné Expo projectId v app.json. EAS je volitelná služba pro sestavení/distribuci; databázi ani API neprovozuje. Profily jsou v eas.json.

Historie commitů používá popisné české předměty bez povinných prefixů. V PR popište změnu chování, ověření a konfiguraci či migraci; připojte související issue a snímky při změně UI. README se podle přání uživatele neobnovuje.

Při aktualizacích ověřujte [Better Auth OTP](https://better-auth.com/docs/plugins/email-otp), [Bearer plugin](https://better-auth.com/docs/plugins/bearer) a [oficiální PostgreSQL image](https://hub.docker.com/_/postgres). Změna knihovny autentizace může vyžadovat novou SQL migraci.

## Ověření připomínek před dokončením aplikace

Automatické scénáře jsou v `src/services/reminderPlan.test.ts` a `notifications.native.test.ts`; nativní rozhraní Expo je nahrazené simulací. Pro kontrolu nativního JavaScriptu bez nasazení lze spustit `npx expo export --platform android --output-dir .cache/native-export`. Nevytváří instalovatelnou aplikaci ani neověřuje doručení.

Na skutečném telefonu s testovacími daty ověřte:

1. Povolte upozornění a vytvořte kúru končící dnes s časem několik minut dopředu. Ověřte jednu obecnou připomínku a žádný termín po posledním dni.
2. Změňte čas nebo poslední den léčby a zkontrolujte odstranění původního termínu. Totéž ověřte po přenosu změny z druhého zařízení.
3. Otevřete aplikaci po přechodu na další den; skončená kúra nesmí znovu vytvořit opakované upozornění.
4. Ověřte týdenní dlouhodobý rozvrh, budoucí začátek, zamítnutá oprávnění a opětovné povolení přes Rodina → Připomínky v telefonu.
5. U dlouhé omezené kúry zkontrolujte zobrazený termín doplnění a jeho posunutí po novém otevření. Po odhlášení nesmějí zůstat připomínky předchozího účtu.

Přesné doručení může omezovat operační systém. Android implementace instalovaného Expo používá při nepovolených přesných alarmech přibližné plánování; nastavení telefonu je proto součástí kontroly. Rozhraní spouštěčů popisuje [Expo Notifications pro SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
