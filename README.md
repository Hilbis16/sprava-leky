# Moje léky – rodinná správa léků

Mobilní MVP pro pečující a seniory. Funguje ihned v lokálním demo režimu a po doplnění proměnných prostředí obousměrně synchronizuje rodinná data s připraveným Supabase backendem.

## Spuštění

```powershell
npm install
npm run start
```

Pro webový náhled použijte `npm run web`. Kamera, on-device OCR a push notifikace vyžadují fyzický Android/iPhone a development build:

```powershell
npx expo prebuild
npx eas build --profile development --platform android
```

OCR je nativní modul ML Kit, proto není součástí Expo Go. QR skener funguje přes `expo-camera`. Bez nakonfigurovaného Supabase aplikace ukládá stav do SQLite-backed key/value úložiště zařízení.

## Cloudový režim

1. Vytvořte projekt Supabase v regionu Frankfurt.
2. Zkopírujte `.env.example` do `.env` a doplňte URL a publishable key.
3. Nainstalujte Supabase CLI a spusťte `supabase db push`.
4. Zapněte anonymous sign-ins pouze pro uzavřený pilot. Aplikace vytváří 24hodinové jednorázové rodinné pozvánky jako QR/deep link; v databázi uchovává pouze SHA-256 otisk tokenu.
5. Pro vzdálené push notifikace nasaďte funkci `push-notifications` a nastavte `CRON_SECRET` a `EXPO_ACCESS_TOKEN`.

Aplikace se v cloudovém režimu synchronizuje sama: po spuštění, při návratu do popředí a pár sekund po každé změně. Neodeslané změny se zkouší znovu každou minutu.

### Upozornění pečujícím na nepotvrzenou dávku

1. V `app.json` nahraďte `REPLACE_WITH_EAS_PROJECT_ID` skutečným ID projektu (`npx eas init`). Bez něj aplikace push token neregistruje; lokální připomínky fungují dál.
2. Nasaďte funkci a nastavte tajné hodnoty:

```powershell
supabase functions deploy push-notifications
supabase secrets set CRON_SECRET=<náhodný řetězec> EXPO_ACCESS_TOKEN=<token z expo.dev>
```

Volitelně `MISSED_DOSE_DELAY_MINUTES` (výchozí 120).

3. Spouštějte funkci každých 10 minut, např. přes `pg_cron` a `pg_net` v SQL editoru Supabase:

```sql
select cron.schedule('missed-dose-alerts', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://<projekt>.supabase.co/functions/v1/push-notifications',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  );
$$);
```

Funkce najde dávky nepotvrzené déle než nastavenou dobu (nejvýše 12 hodin zpět), každou ohlásí jen jednou a pošle obecné upozornění vlastníkům a pečujícím daného profilu, ne seniorovi. Text neobsahuje název léku ani jméno.

Pro veřejný provoz nahraďte anonymní účty ověřeným magic-link/telefonním přihlášením, doplňte auditní log, proces odvolání zařízení a právní/bezpečnostní posouzení.

## Bezpečnostní hranice MVP

- QR eReceptu ukládá jen 12místný identifikátor; obsah předpisu aplikace nečte.
- OCR údaje pouze předvyplní a uživatel je musí potvrdit.
- Aplikace neurčuje dávkování ani neradí, co dělat po vynechání dávky.
- Text vzdálené notifikace neobsahuje jméno léku.
- Jde o demo a malé rodinné použití, ne o certifikovanou zdravotnickou pomůcku.

## Ověření

```powershell
npm run typecheck
npm test
npm run lint
npm run build:web
```
