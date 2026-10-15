# Changelog

All notable changes to Atlas. Versions follow [semantic versioning](https://semver.org).

Each release's **Highlights** list is shown in the app's "What's new" sheet, so write it for the
people using Atlas: short, plain, benefit first. Put everything else under other headings
(`### Fixes`, `### Internal`), which only appear here.

Work in progress goes under `## [Unreleased]`. `npm run release` turns that section into the new
version with today's date.

## [Unreleased]
### Highlights
- A strong, calm training app that works fully offline
- Your data stays on your phone, with automatic safety snapshots before every update
- Backups you can save to Files and restore with a preview
### Internal
- App shell, offline service worker and update flow
- IndexedDB data layer with numbered migrations, snapshots and migration tests
