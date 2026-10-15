# Atlas

A strength training app for iPhone (and any modern phone) with a built-in coach that learns from
every set. It installs to the Home Screen, works fully offline, and keeps all data on the phone:
no accounts, no servers, no tracking.

- **Setup in under a minute.** Goal, days, session length and gym; Atlas builds a plan from the
  equipment your gym really has. Pillar is built in, mapped to the Office machines.
- **Workouts.** One exercise at a time, weight and reps filled in, one tap per set, a rest timer,
  machine settings remembered per machine, swaps when a station is taken or something hurts, cardio.
- **Coach.** Suggests the next weight, spots plateaus, balances weekly volume and plans lighter
  weeks, from published training research. Every suggestion has a **Why?** and nothing changes
  your plan until you tap Apply.
- **Progress.** Week calendar and streak, per-exercise charts and records, body measurements.

## Use it on iPhone

1. Open the site in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**, then open Atlas from the Home Screen.
   The Home Screen app keeps its own data, separate from Safari, and iOS protects it from cleanup.
   Set up there, not in the Safari tab.
3. Answer the setup questions. The first week finds your working weights, so the first sessions
   start light on purpose.
4. **Back up** from **Settings › Export backup** every few weeks (Atlas reminds you). The file goes
   to Files or iCloud Drive; **Import backup** restores it, on this phone or a new one.

Good to know:

- **Deleting the Home Screen icon deletes your data**, and so does clearing Safari's website data.
  Export a backup first.
- **Rest timer chime.** iPhone pauses web sounds while the phone is locked, so Atlas keeps the
  screen on during workouts (**Settings › Workouts › Keep screen on**). If you lock the phone
  anyway, the timer still keeps correct time; if the rest ended meanwhile, it shows that when you
  come back, without a chime.
- **Haptics** work on iOS 18 and later, on taps only.
- **Readiness check** (how you slept and feel, before a workout) is optional. Tap **Don't ask
  before workouts** on the check-in, or switch it in **Settings › Workouts**. The wearable score
  (e.g. Oura) is off unless you turn it on.
- **Updates** download in the background. An "Update ready" banner appears when you're not in a
  workout; tap Update. "What's new" shows once after each update.

## Deploy to GitHub Pages

The site is static and works at any path (`https://<you>.github.io/<repo>/`), so there is nothing
to configure.

1. Create an empty repository on GitHub (no README or license, so the first push is clean).
2. Push this folder to it:

   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

3. In the repository: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
4. The push runs `.github/workflows/deploy.yml`: install, typecheck, tests, build, deploy. Watch it
   under **Actions**; the site URL appears on the run's deploy step and in **Settings › Pages**.
   If the first run finished before step 3, re-run it from **Actions › Deploy to GitHub Pages ›
   Run workflow**.
5. Open the URL on the iPhone and follow "Use it on iPhone" above.

Every later push to `main` deploys again. Phones pick up the new version the next time Atlas
opens or comes back to the foreground.

## Release an update

Single source of truth for the version: `package.json`. The full checklist is in `CLAUDE.md`
(Versioning and release checklist). In short:

1. Add user-facing notes under `## [Unreleased]` → `### Highlights` in `CHANGELOG.md`
   (these become the "What's new" sheet).
2. `npm run release -- patch` (or `minor` / `major`): typecheck, tests, version bump, dated
   changelog, build.
3. `npm run preview` once: cold start, offline, update banner with existing data.
4. Commit, tag and push:

   ```bash
   git add -A
   git commit -m "Release vX.Y.Z"
   git tag vX.Y.Z
   git push --follow-tags
   ```

Changing what's stored? Add a migration, the previous version's fixture and tests first (rules in
`CLAUDE.md`, Data and safety rules). Migrations only ever add; they never delete data.

## Check on a real iPhone

Automated tests cover the data layer, migrations, backups, the workout engine and the Coach;
browser checks covered 393×852 and 320×568 in both themes, offline cold start and an update with
data during a workout. A few things only a real phone can show. After the first deploy (and after
releases that touch these areas):

- [ ] **Install:** Safari shows the Home Screen guide first; Add to Home Screen; the icon and
      name look right; Atlas opens full screen with no Safari bars.
- [ ] **Safe areas:** nothing hides under the Dynamic Island or the home indicator, on Today,
      in a workout (bottom bar) and in sheets.
- [ ] **Storage:** Settings › Your data says "Storage is protected" in the Home Screen app.
- [ ] **Offline:** turn on Airplane Mode, force-quit Atlas, open it: everything works, including
      a full workout.
- [ ] **Rest timer:** log a set; the chime plays at zero with the screen on. Lock the phone
      mid-rest and unlock before it ends: the time left is right and the chime still plays.
      Unlock after it ends: the timer shows it's over.
- [ ] **Keep screen on:** during a workout the screen doesn't dim; after it, it does again.
- [ ] **Haptics** (iOS 18+): a tap when logging a set; off when Settings › Haptics is off.
- [ ] **Resume:** force-quit mid-workout and reopen: same exercise, same sets, rest timer intact.
- [ ] **Keyboard:** typing a weight or a note doesn't zoom the page; the bottom bar stays usable.
- [ ] **Backup:** Export saves a file to Files; Import shows a preview and restores it.
- [ ] **Dark mode:** switch the phone to dark; every screen follows (or set Settings › Theme).
- [ ] **Update:** after a deploy, reopen Atlas: the "Update ready" banner appears (not during a
      workout), Update reloads into the new version, What's new shows once, data is unchanged.

## Develop

Requires Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:5173 (no service worker)
npm test           # unit tests: data, migrations, backups, workout engine, Coach scenarios
npm run typecheck
npm run build      # production build in dist/, plus the generated service worker
npm run preview    # serve the build on :4173 with the service worker (offline/update testing)
```

`CLAUDE.md` holds the architecture, data safety rules, design system, Coach structure and how to
add equipment, exercises, gym presets and templates. The Coach's rules and sources are in
`docs/coach-proposal.md`.
