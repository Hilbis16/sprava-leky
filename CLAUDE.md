# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Moje léky" — an Expo (React Native + expo-router) MVP for families managing a senior's medications. It runs offline in local demo mode, and syncs with Supabase once `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set in `.env` (see `.env.example`). All user-facing strings, comments in the README and error messages are in Czech; keep new UI text in Czech.

## Commands

```powershell
npm run start            # Expo dev server (npm run web for browser preview)
npm run typecheck        # tsc --noEmit
npm test                 # vitest run (all tests)
npx vitest run src/domain/forecast.test.ts   # single test file
npx vitest run -t "name"                     # tests matching a name
npm run lint             # eslint (supabase/functions is ignored)
npm run build:web        # expo export --platform web
supabase db push         # apply migrations in supabase/migrations
```

Run typecheck, test, lint and build:web to verify a change. Camera, ML Kit OCR and push notifications need a physical device with a development build (`npx expo prebuild`, `npx eas build --profile development --platform android`); they don't work in Expo Go.

## Architecture

- **Routing**: `src/app/` (expo-router, typed routes). `_layout.tsx` wraps everything in `AppStateProvider` and shows a loader until data is loaded. Tabs live in `src/app/(tabs)/`; deep link scheme is `mojeleky://` (e.g. `invite/[token]`).
- **State**: `src/state/AppState.tsx` is the single source of truth — one `AppData` object (`src/domain/types.ts`) held in a React context and mirrored in `dataRef` for actions that read it outside render. Every data-changing action builds a `PendingMutation` and calls `commit()`, which applies it through the pure reducer `applyMutation` (`src/domain/mutations.ts`), queues it and persists the whole object. A new kind of change needs: an `entity` in `PendingMutation`, a case in `applyMutation`, and a branch in the `apply_mobile_mutation` RPC (new migration).
- **Stock is event-sourced**: stock = sum of `inventoryEvents` minus scheduled doses since `regimen.effectiveFrom` (unconfirmed past doses count as taken). Editing a schedule restarts the regimen today and adds a `correction` event so today's estimate doesn't jump (`regimenChangeCorrectionQuantity`); a counted stock is recorded the same way. Medications are never deleted, only `active: false`.
- **Domain** (`src/domain/`): pure, tested logic — dose schedule/occurrence generation (`schedule.ts`, occurrence IDs are deterministic from medication + time), stock forecasting (`forecast.ts`), eRecept ID normalization, Rx request message building. Tests sit next to sources as `*.test.ts`; `@/` aliases `src/`.
- **Persistence**: `src/data/localStore.ts` (expo-sqlite kv-store) vs `localStore.web.ts` (localStorage), selected by Metro platform suffixes (`.native`/`.web`, also used in `src/services/` for notifications and OCR). Stored data is only envelope-validated with zod (`schemaVersion: 1`); invalid/missing data falls back to `createDemoData()`. Bump `schemaVersion` and the storage key if the `AppData` shape changes incompatibly.
- **Sync** (`src/data/sync.ts`): signs in anonymously, calls RPC `bootstrap_family_profile` per profile, then replays all local entities as idempotent "bootstrap" mutations plus queued ones through RPC `apply_mobile_mutation`, then pulls server state and merges via `mergeFamilySnapshots` (server snapshot replaces local data for those profiles). Sync runs on a snapshot; `applySyncResult` (`src/data/applySync.ts`) keeps mutations recorded meanwhile queued and replays them over the pulled data. IDs from `createId` are plain UUIDs because the DB columns are `uuid`.
- **Backend** (`supabase/`): migrations define tables, RLS via `is_profile_member()`, and the RPCs. `apply_mobile_mutation` switches on `entity_name` (`dose_action`, `inventory_event`, `medication`, `prescriber`, `rx_request`) and maps camelCase JSON payloads to snake_case columns — adding a new mutation entity requires changing both the client and a new migration. Family invites (`create_family_invite` / `accept_family_invite`, client in `src/data/invites.ts`) store only a SHA-256 hash of a 24h one-time token. `supabase/functions/push-notifications` is a Deno edge function guarded by `x-cron-secret`, run by cron: it calls `claim_missed_dose_alerts` (recomputes scheduled occurrences in SQL — must stay consistent with `src/domain/schedule.ts`; a dose is "confirmed" when `dose_actions` has the same `medication_id` + `scheduled_at`) and pushes to `caregiver_push_tokens` (owners/caregivers only). Devices register via the `register_push_device` RPC from `src/services/notifications.native.ts`.
- **Auto sync**: `AppStateProvider` syncs on start, on foreground, 3 s after changes and every 60 s while mutations are pending. The full local history is uploaded only once per cloud user (`cloudBootstrappedFor`).
- **Testing SQL**: no Supabase CLI here; migrations can be checked in a plain `postgres` Docker container with a stub `auth` schema (`auth.users`, `auth.uid()` reading `request.jwt.claim.sub`) and roles `anon`/`authenticated`/`service_role`.

## Product/safety constraints (from README)

- eRecept QR stores only the 12-character identifier; prescription content is never read.
- OCR only pre-fills fields; the user must confirm them.
- The app must not determine dosage or advise what to do after a missed dose.
- Notification text (local reminders and remote push) must not contain the medicine name.
- On web, `Alert.alert` buttons do nothing (react-native-web); use `confirmAction` from `src/components/confirm.ts` for confirmations.
- Anonymous Supabase sign-ins are for a closed pilot only.
