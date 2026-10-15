# Changelog

All notable changes to Atlas. Versions follow [semantic versioning](https://semver.org).

Each release's **Highlights** list is shown in the app's "What's new" sheet, so write it for the
people using Atlas: short, plain, benefit first. Put everything else under other headings
(`### Fixes`, `### Internal`), which only appear here.

Work in progress goes under `## [Unreleased]`. `npm run release` turns that section into the new
version with today's date.

## [Unreleased]
### Highlights
- All strength: cardio logging is gone, so keep tracking it with your watch or Strava. Cardio you logged before stays in your history
- Fix any past workout: open it from Progress › Workouts, tap Edit, and change a set, remove an exercise or delete the workout
- A workout started by mistake can always be discarded
- Setup asks who’s training to pick your leg exercises: machines (leg press, curls, extensions) or squats and deadlifts with hip thrusts
- Switch your leg exercises anytime in Plan › Plan settings; switching back restores your plan exactly
### Internal
- Cardio removed: no cardio-only sessions, no cardio finishers (generator and Pillar), no interval timer. Old
  data stays readable; cardio finishers saved in older plans are skipped (`liftingExtras`)
- `domain/legStyle.ts`: machine swaps per pattern with a two-per-machine limit, `slot.freeWeight` to restore;
  hip thrust pattern and exercises; leg press feet-high and single-leg variations
- Finished workouts: `changePastSession` / `deletePastSession` with Undo; `removeEntry`; `EditSetSheet` shared

## [1.0.0] - 2026-10-14
### Highlights
- Setup in under a minute: a plan built from your gym's real equipment. Pillar is built in, mapped to the Office machines
- Workout mode: one exercise at a time, weight and reps filled in, one tap per set, and a rest timer that keeps time through a lock
- Your first sessions find your working weights; rate each set by the reps you had left
- Station taken or something hurts? Swap to the closest exercise your gym has. Seat and pad settings are remembered per machine
- Cardio and intervals, an optional check-in before and a 10-second check-out after
- Close the app mid-workout and it reopens exactly where you were, even offline
- A coach that reads every set: when to add weight, hold or back off, with the reason and the research one tap away. Nothing in your plan changes without your OK
- Short on time? A shorter version keeps the key lifts. Lighter weeks and easing back in after a break are planned for you
- Progress: your streak, a training calendar, every record, a chart for each lift, and body measurements
- Make the plan yours, and train at more than one gym: your plan follows you
- Works fully offline and your data stays on your phone, with backup reminders and backups you save to Files
### Internal
- App shell, offline service worker and update flow
- IndexedDB data layer with numbered migrations, snapshots and migration tests
- Equipment and exercise catalogs, equipment-aware load math, pattern resolver, program generator
- Home Screen guide before setup, onboarding, Today, read-only Plan/day/gym views, Redo setup
- Workout engine (`domain/workout.ts`): sessions, supersets, calibration (A1 with A5 for big jumps),
  rest sizing, swaps with conservative conversion (I2), records; saved on every tap with resume
- Coach engine (`src/coach/`): rules A–L from the approved proposal, knowledge and phrases as data,
  repetition control, stable recommendation ids; scenario tests render every message
- Progress domain (`domain/progress.ts`) on the Coach's measures; SVG charts without a library
- Plan and gym editing as pure functions with Undo; rule I3 applied at session time
- QA: 44px touch areas for compact controls, text contrast at WCAG AA in both themes (`--ink-3`,
  `--good`, `--warn`, new `--on-status`), focus kept inside sheets, long names wrap, Latin-only
  font files (14 → 11 precached files)
