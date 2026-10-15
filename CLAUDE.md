# Atlas: notes for Claude Code

Read this first. Atlas is a mobile-first strength training PWA (iPhone first) with an on-device
Coach. Static site on GitHub Pages: no backend, no accounts, no API keys. All user data lives in
IndexedDB on the phone.

## Status (keep this current)

| Stage | State |
|---|---|
| 0. Foundation: shell, design tokens, data layer, migrations, snapshots, backups, service worker, update flow, release tooling | Done |
| Coach rules proposal (`docs/coach-proposal.md`) | Approved as proposed (2026-10-14). Build the Coach to it |
| 1. Catalogs: equipment, exercises (with form notes), Office gym preset, Pillar template, program generator | Done (branch `stage-1-catalogs`) |
| 2. Onboarding (Home Screen guide first), Today, read-only Plan view | Done (branch `stage-2-onboarding`, cut from stage 1) |
| 3. Workout: focus mode, rest timer, machine settings (incl. confirming `verifyLoad` stack steps), swaps, cardio, resume, check-in | Done (branch `stage-3-workout`, cut from stage 2) |
| 4. Coach engine + tests + UI | Next. Hook points: readiness on the session (C1/C2), in-session offers (B1/B2) next to the set logger, progression (A2–A5) into `suggestFirstSet` |
| 5. Progress: week view, charts, PRs, body measurements | |
| 6. Plan editing, gyms/equipment editing, backup reminder | |
| 7. QA (393×852, both themes, offline, cold start, update with data), README, deploy | |

## Commands

| | |
|---|---|
| `npm run dev` | Dev server (no service worker in dev) |
| `npm run build` | Production build into `dist/`, plus generated `dist/sw.js` |
| `npm run preview` | Serve `dist/` on :4173 (service worker active: use this to test offline/updates) |
| `npm test` | Vitest: data layer, migrations, backups, changelog, service worker guards, catalogs, loads, resolver, generator (and later the Coach) |
| `$env:ATLAS_PREVIEW="1"; npx vitest run tests/domain/preview.test.ts` | Regenerates `docs/program-samples.md` (Pillar at the Office + generated plans) for a human review |
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
  main.tsx              Boot order: open DB (migrate) → load profile/gym/plan → cold-start update → render
  app/                  App shell (gates: Home Screen guide → setup → tabs), router (hash routes with
                        params: #/plan/day/<id>, #/plan/gym), state signals, repo (load/save training data)
  screens/              Today, Settings, Recovery, InstallGuide, onboarding/, plan/ (Plan, day, gym,
                        SessionList, ExerciseSheet), workout/ (focus mode, sheets, finishers/cardio,
                        check-in/check-out, summary)
  ui/                   Design system: Icon, Logo, controls (Button/Toggle/Segmented), List, Sheet, feedback
  styles/tokens.css     Colors (light + two identical dark blocks), type scale, spacing, motion
  db/                   IndexedDB: types, schema, migrations, open, snapshots, backups, kv settings
  pwa/                  Service worker registration, update flow, changelog parsing, What's new
  sw/service-worker.js  SW template (plain JS); the build injects the precache list
  lib/                  Small helpers: ids, dates/format, haptics, platform
  data/                 Catalogs as JSON: equipment, exercises, patterns, gyms/office, templates/
                        (pillar + generator blueprints), programming.json (reps/sets/rest/volume bands)
  domain/               Pure functions over the catalogs: catalog (typed access), gym (presets,
                        capability tags), loads (equipment-aware load math), strength (e1RM),
                        resolver (pattern → exercise, swaps, start loads), generator, volume,
                        workout (session engine)
  (coming) coach/       Pure-function Coach engine; knowledge + phrases JSON in data/coach/
vite-plugins/atlas-pwa.ts  Generates dist/sw.js + dist/version.json after each build
tests/                  Vitest; tests/db/fixtures/vN.json = sample data for every schema version
docs/coach-proposal.md  Evidence-based Coach rules with sources (approved)
docs/program-samples.md Generated plans for review (regenerate after catalog/generator changes)
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

## First run and setup

- `App` gates in order: Home Screen guide (phones in a browser tab, once; `appMeta.installGuideDismissedAt`),
  then onboarding (`needsSetup`: no `onboardingCompletedAt` or no active plan, or `redoingSetup`), then tabs.
  On iPhone the Home Screen app has storage separate from Safari, which is why the guide comes first.
- Onboarding (`screens/onboarding/Onboarding.tsx`) collects `OnboardingAnswers`; `domain/onboarding.ts`
  turns them into a Gym, Program and Profile; `app/repo.saveOnboarding` writes them in one transaction.
  Single-choice steps auto-advance. "Redo setup" in Settings re-runs it; old gyms/plans stay in the DB.
- Starting weights: `profile.startingLoads` (sets the user knew). `domain/start.ts` turns them into a
  first-session load per slot; otherwise a light catalog guess marked "~" in the UI (calibration, rule A1).
- Fixed bottom bars and sheets must render through `ui/Portal` (or the Sheet's portal): the screen
  enter animation transforms the screen container, which breaks `position: fixed` while it runs.

## Workouts

- **Engine** (`domain/workout.ts`, pure, tested in `tests/domain/workout.test.ts`): every action is
  `(session, …, now) → session` (`logSet`, `rateSet`, `swapEntry`, `skipEntry`, `postponeEntry`,
  `logCardio`, `finishSession`…). No clock reads inside; `now` is passed in.
- **Store** (`app/workout.ts`): `activeSession` signal. Every change goes through `changeSession`,
  which saves to IndexedDB *first*, then updates the screen, one change at a time in order. Start,
  finish and discard also set/clear `appMeta.activeSessionId` in the same transaction
  (`db/sessions.ts`). While it's set, updates never apply and What's new waits.
- **Resume**: the session stores its cursor and the rest timer as timestamps (`rest.endsAt`,
  `intervalTimer.startedAt`), so a reload, crash, lock or update resumes exactly. On launch a
  workout touched in the last 3 hours reopens `#/workout`; older ones show Resume on Today.
- **First weights**: `suggestFirstSet` = last time's top working weight (history), the set entered
  at setup (known), or a light catalog guess (calibrate). `calibrating` (no history, a swap
  estimate, or only one exposure) makes `prefill` follow rule A1 set by set, with A5 when the next
  step is a big jump (more reps first). Otherwise the next set repeats the last; changing that is
  the Coach's job (stage 4).
- **UI**: `#/workout` renders outside `.screen-host` (opacity-only animation) so the fixed dock
  works; the dock measures itself into `--dock-h`. Rest chime: Web Audio, primed on the Done tap,
  scheduled at `rest.endsAt`, rescheduled on returning to the app. iPhone suspends web audio when
  locked, so the screen is kept awake (Wake Lock, Settings › Keep screen on). Android also vibrates.
- **Readiness** (`ReadinessSheet`): only when `settings.readinessCheck`; "Skip today" for once,
  "Don't ask before workouts" switches it off with a toast pointing to Settings › Workouts.
- Records (`detectRecords`) compare against earlier sessions only; a first session never counts.

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
Readiness check is optional and must stay one tap to switch off (check-in sheet: "Don't ask before
workouts"; Settings › Workouts) and back on; the wearable score is off by default.

## Catalogs: equipment, exercises, templates

Everything is data in `src/data/`; types in `src/domain/types.ts`. `tests/domain/catalog.test.ts`
validates every cross-reference, so a typo fails `npm test` instead of the app.

**How the pieces connect.** Equipment *provides* capability tags (`smith`, `cable-station`,
`cable-dual`, `leg-press-machine`…). Exercises *require* tags and name the one that sets the load
(`loadFrom`). Programs are written as movement *patterns* (`incline-press`, `hinge`…), and
`resolver.resolvePattern` picks the best exercise the gym can do (template `prefer` list first, then
catalog `rank`, demoting exercises above the user's level or loading a flagged pain area, then the
pattern's `fallbacks`). That's how Pillar becomes Smith/machine work at the Office and barbell work
elsewhere, and how "Station taken?" works (`swapOptions` excludes everything on the busy machine).

**Loads.** `loads.ts` turns an equipment load model into the exact list of possible loads
(stack pins × add-ons, bar + even plate pairs, the dumbbell rack). Every suggestion must go through
`snapLoad`/`stepLoad`. `nextStepFraction` tells the Coach when a jump is too big and reps should
progress first (rule A5). Stack plate steps for Office machines are unconfirmed (`verifyLoad: true`):
the UI must ask the user to confirm the real steps on first use.

- **Add equipment:** append to `equipment.json` with `provides`, a `load` spec, `settingsFields`
  (what to remember per machine), `cardioMetrics` for cardio, `checklist: true` to offer it in the
  "what's in your gym" list, and a `source` note for specs.
- **Add an exercise:** append to `exercises.json`: `pattern`, `primary`/`secondary` muscles (used for
  weekly fractional sets), `requires`, `loadFrom` + `loadMode` (`total`/`per-hand`/`per-side`/
  `bodyweight`/`none`), `metric`, `kind`, `restClass`, `rank` within the pattern, `level` if it's not
  for beginners, `ratio` (strength vs the pattern's reference lift, for swap start estimates),
  `start` (conservative first-session guesses), `stresses` (body areas, for pain swaps) and `form`
  (setup sentence, ≥2 cues, ≥1 watch-for; plain words, full sentences).
- **Add a gym preset:** a file in `data/gyms/` listing catalog ids with optional name/load overrides;
  register it in `domain/catalog.ts`.
- **Add a template:** a file in `data/templates/` (days → slots with pattern, `prefer`, role, sets,
  reps, purpose; schedule Mon..Sun); register it in `domain/catalog.ts`.

**Generator** (`generator.ts`): blueprint by days/week → resolve exercises (varying repeat patterns
across the week) → prescribe sets/reps/reps-left/rest from `programming.json` by goal, experience
and role → fit the session length (supersets of non-competing accessories on different stations,
then drop lowest-priority exercises, then trim sets) → balance weekly sets per muscle into the
experience band → fat-loss cardio finishers. After changing catalogs or the generator, regenerate
`docs/program-samples.md` and read it like a coach would.
