# Atlas: notes for Claude Code

Read this first. Atlas is a mobile-first strength training PWA (iPhone first) with an on-device
Coach. Static site on GitHub Pages: no backend, no accounts, no API keys. All user data lives in
IndexedDB on the phone.

## Status (keep this current)

| Stage | State |
|---|---|
| 0. Foundation: shell, design tokens, data layer, migrations, snapshots, backups, service worker, update flow, release tooling | Done |
| Coach rules proposal (`docs/coach-proposal.md`) | Awaiting approval. Don't build the Coach until it's approved |
| 1. Catalogs: equipment, exercises (with form notes), Office gym preset, Pillar template, program generator | Next |
| 2. Onboarding (Home Screen guide first), Today | |
| 3. Workout: focus mode, rest timer, machine settings, swaps, cardio, resume, check-in | |
| 4. Coach engine + tests + UI | |
| 5. Progress: week view, charts, PRs, body measurements | |
| 6. Plan editing, gyms/equipment editing, backup reminder | |
| 7. QA (393×852, both themes, offline, cold start, update with data), README, deploy | |

## Commands

| | |
|---|---|
| `npm run dev` | Dev server (no service worker in dev) |
| `npm run build` | Production build into `dist/`, plus generated `dist/sw.js` |
| `npm run preview` | Serve `dist/` on :4173 (service worker active: use this to test offline/updates) |
| `npm test` | Vitest: data layer, migrations, backups, changelog, service worker guards (and later the Coach) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run icons` | Re-render app icons from the mark in `scripts/icons.mjs` |
| `npm run release -- patch\|minor\|major` | Checks, tests, bumps version, dates the changelog, builds |

On this Windows machine Node was installed after the desktop app started. In a PowerShell tool call,
refresh PATH first: `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.
Don't edit files with PowerShell `Get-Content`/`Set-Content`: Windows PowerShell 5.1 mangles UTF-8 and adds BOMs.

## Stack and layout

Vite 8 + Preact 10 + TypeScript + `@preact/signals`. `idb` for IndexedDB. Plain CSS with tokens.
Hand-written service worker (no Workbox). Vitest + fake-indexeddb for tests.

```
src/
  main.tsx              Boot order: open DB (migrate) → cold-start update → render → background work
  app/                  App shell, router (hash routes), state signals, tab bar, backup actions
  screens/              One file per screen (Today, Settings, Recovery, …)
  ui/                   Design system: Icon, Logo, controls (Button/Toggle/Segmented), List, Sheet, feedback
  styles/tokens.css     Colors (light + two identical dark blocks), type scale, spacing, motion
  db/                   IndexedDB: types, schema, migrations, open, snapshots, backups, kv settings
  pwa/                  Service worker registration, update flow, changelog parsing, What's new
  sw/service-worker.js  SW template (plain JS); the build injects the precache list
  lib/                  Small helpers: ids, dates/format, haptics, platform
  (coming) data/        Equipment catalog, exercises, templates, coach knowledge + phrases (JSON)
  (coming) coach/       Pure-function Coach engine
vite-plugins/atlas-pwa.ts  Generates dist/sw.js + dist/version.json after each build
tests/                  Vitest; tests/db/fixtures/vN.json = sample data for every schema version
docs/coach-proposal.md  Evidence-based Coach rules with sources
```

## Design system

- Brand: strong, calm, premium. Warm paper neutrals, near-black ink, **Atlas blue** (`--accent`) for
  actions, **ember** (`--win`) only for wins (PRs, streaks). Font: Geist Variable (self-hosted,
  precached). Body 17px; large titles 34px; numbers use tabular figures (`.num`).
- The mark (`src/ui/Logo.tsx`): a figure bearing a sphere. Geometry is duplicated in
  `scripts/icons.mjs`; change both and run `npm run icons`.
- Tap targets ≥ 44px; primary actions 56px. Respect `env(safe-area-inset-*)` (tokens `--safe-*`).
- Copy: plain words, sentence case, no jargon without an inline explanation, no "please",
  no exclamation marks except real wins. Empty states invite (what this space is for + one action).
- Motion: subtle and functional only; `prefers-reduced-motion` turns it off globally.
- Haptics: `haptic()` in `lib/haptics.ts` (Android vibration; iOS 18+ switch-control trick, only
  inside user gestures).

## Data (IndexedDB) and safety rules — non-negotiable

Database `atlas`, schema version = number of migrations in `src/db/migrations.ts`.

| Store | Key | Holds |
|---|---|---|
| `kv` | `key` | `profile`, `settings`, `app` (meta: installId, lastSeenVersion, persist status, lastBackupAt, activeSessionId…) |
| `gyms` | `id` | Gym + its equipment list with load models (stack/plates/dumbbells/fixed/bodyweight/none) |
| `programs` | `id` | Days → slots (exercise, sets, rep range, target reps-left, rest, priority), weekly schedule, block |
| `exercises` | `id` | User-created exercises (the shipped catalog is a data file, not stored) |
| `sessions` | `id`; idx `byDate`, `byStatus` | Workouts: entries → sets (load, reps, rir, rest taken, pain), cardio, readiness, check-out, cursor + rest timer for resume |
| `measurements` | `id`; idx `byDate` | Body weight, waist, shoulders, chest, arm, thigh |
| `machineSettings` | `gym:equipment:exercise`; idx `byGym` | Seat/pad positions per machine per exercise |
| `coachLog` | `id`; idx `byAt`, `byKey` | Shown insights and decisions (repetition control, history) |

Types: `src/db/types.ts`. Settings are merged over `DEFAULT_SETTINGS`, so new settings need no migration.

Rules:
1. User data lives **only** in IndexedDB. Never localStorage for user data (sessionStorage is used
   only for two boot-loop guards). The service worker only touches caches named `atlas-*`.
2. **Adding a migration**: append to `MIGRATIONS` with the next version. Additive only (new stores,
   indexes, backfilled fields). Never delete/reset user data. Use only `ctx.tx`; never await
   non-IndexedDB work inside a migration. Migration 1 may be edited only until v1.0.0 ships.
3. Before migrating existing data, `openAtlasDB` saves a snapshot to the separate
   `atlas-snapshots` DB (last 5 kept). A failing migration aborts the upgrade (IndexedDB rolls back);
   if the version doesn't match afterwards, the snapshot is restored. The app then shows
   `RecoveryScreen` (retry / save a copy) instead of a broken UI.
4. **Every schema version needs a fixture**: when adding migration N+1, freeze the current data
   shape as `tests/db/fixtures/vN.json` (the test fails if one is missing) and extend
   `tests/db/migrations.test.ts` with assertions for the new migration.
5. Backups (`src/db/backup.ts`): JSON `{format:'atlas-backup', formatVersion, schemaVersion, stores}`.
   Import validates, previews, snapshots current data, migrates old backups through the same
   migrations in a temp DB, then replaces data in one transaction.

## Service worker and updates

- `vite-plugins/atlas-pwa.ts` lists every built file with a content hash and writes `dist/sw.js`;
  any change in any file changes `sw.js`, so browsers always see new versions.
- The SW precaches with `{cache: 'reload'}`, looks up with `ignoreVary: true` (without it, module
  script requests miss the cache and the app silently depends on the network; a test guards this),
  serves `index.html` for navigations, and never calls `skipWaiting()` on its own.
- Update flow (`src/pwa/register.ts`): check on launch and on returning to the foreground →
  waiting version shows the "Update ready" banner (hidden during a workout) → Update applies it.
  A version still waiting at the next cold start is applied before render unless a workout is in
  progress. After an update: "Updated to vX" toast + What's new (from CHANGELOG Highlights), once.
- `index.html` has a last-resort script: if the bundle fails to load, activate a waiting version
  and reload once; otherwise show "Repair and reload" (clears SW + `atlas-*` caches, never data).

## Versioning and release checklist

Single source of truth: `package.json` `version` (injected as `__APP_VERSION__`, shown in Settings).

1. Write user-facing notes under `## [Unreleased]` → `### Highlights` in CHANGELOG.md
   (other headings like `### Internal` don't show in the app).
2. Schema changed? Add the migration + the previous version's fixture + tests (rules above).
3. `npm run release -- patch|minor|major` (runs typecheck + all tests first, then bumps, dates the
   changelog, builds).
4. Check `npm run preview` once: cold start, offline (stop the server, reload), update banner
   with existing data.
5. `git add -A && git commit -m "Release vX.Y.Z" && git tag vX.Y.Z && git push --follow-tags`.
   The GitHub Action builds, tests and deploys to Pages.

## Coach (not built yet)

See `docs/coach-proposal.md`. Planned shape: pure functions in `src/coach/`, `evaluateCoach(input,
{now, moment}) → { recommendations[], todayPlan?, inSession?, review?, wins[] }`, rules and
thresholds in `src/data/coach/knowledge.json` (each with sources), wording in
`src/data/coach/phrases.json`, rendering separate from the engine so an AI layer can replace it.
Readiness check is optional and must stay one tap to switch off (sheet: "Stop asking"; Settings ›
Workouts) and back on; the wearable score is off by default.

## Adding equipment or exercises (once stage 1 lands)

Equipment, exercises, gym presets and program templates live in `src/data/*.json`. Each equipment
item declares its load model, so suggestions only use loads that machine can produce. Exercises
declare movement pattern, muscles (direct/secondary), required equipment, form notes
(Setup / Cues / Watch for) and rest class. No app logic changes needed for new entries.
