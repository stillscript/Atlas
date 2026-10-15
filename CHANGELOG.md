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
- Works fully offline; your data stays on your phone, with backups you can save to Files
### Internal
- App shell, offline service worker and update flow
- IndexedDB data layer with numbered migrations, snapshots and migration tests
- Equipment and exercise catalogs, equipment-aware load math, pattern resolver, program generator
- Home Screen guide before setup, onboarding, Today, read-only Plan/day/gym views, Redo setup
