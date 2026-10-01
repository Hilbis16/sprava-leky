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
