# Changelog

All notable changes to Atlas. Versions follow [semantic versioning](https://semver.org).

Each release's **Highlights** list is shown in the app's "What's new" sheet, so write it for the
people using Atlas: short, plain, benefit first. Put everything else under other headings
(`### Fixes`, `### Internal`), which only appear here.

Work in progress goes under `## [Unreleased]`. `npm run release` turns that section into the new
version with today's date.

## [Unreleased]
### Highlights
- Setup in under a minute: your goal, days, session length and gym, then a plan built from your gym's real equipment
- Pillar is built in, mapped to the Office machines
- Today shows your session, your week and a light starting weight for every exercise
- Your plan at a glance, with form tips (setup, cues, what to watch for) for every exercise
- Workout mode: one exercise at a time, weight and reps filled in, one tap to log a set
- Rest timer with a chime, +30 s and skip; it keeps time even if the phone locks
- Rate each set by the reps you had left, and your first sessions find your working weights
- Station taken? Swap to something else in your gym, or do that exercise later
- Remembers your seat and pad settings for every machine, and lets you confirm a machine’s weights
- Cardio and intervals, a quick check-in before (easy to turn off) and a 10-second check-out after
- Close the app mid-workout and it reopens exactly where you were, even offline
- New personal bests are called out when you finish
- A coach that reads every set: when to add weight, when to hold, when to back off, with the reason and the research behind it one tap away
- Short on time? A shorter version of today keeps the key lifts
- Lighter weeks, easing back in after a break, and a weekly review of sets per muscle
- Nothing in your plan changes without your OK
- Works fully offline; your data stays on your phone, with backups you can save to Files
### Internal
- App shell, offline service worker and update flow
- IndexedDB data layer with numbered migrations, snapshots and migration tests
- Equipment and exercise catalogs, equipment-aware load math, pattern resolver, program generator
- Home Screen guide before setup, onboarding, Today, read-only Plan/day/gym views, Redo setup
- Workout engine (`domain/workout.ts`): sessions, supersets, calibration (A1 with A5 for big jumps),
  rest sizing, swaps with conservative conversion (I2), records; saved on every tap with resume
- Coach engine (`src/coach/`): rules A–L from the approved proposal, knowledge and phrases as data,
  repetition control, stable recommendation ids; scenario tests render every message
