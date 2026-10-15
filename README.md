# Atlas

A strength training app for iPhone (and any modern phone) with a built-in coach that learns from
every set. It installs to the Home Screen, works fully offline, and keeps all data on the phone.

> Status: in development. Setup, Today, the plan view, workouts and the Coach work; progress
> tracking and plan editing are next. See `CLAUDE.md` for the architecture and roadmap.

## Use it

1. Open the site in Safari on your iPhone.
2. Tap **Share** → **Add to Home Screen**, then open Atlas from your Home Screen.
   (The Home Screen app keeps its data separately from Safari, and iOS protects it from cleanup.)
3. Back up from **Settings › Export backup** now and then. It saves a file to Files.

## Develop

Requires Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, including data migrations
npm run build      # production build in dist/
npm run preview    # serve the build with the service worker (offline/update testing)
```

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
3. Every push to `main` runs typecheck, tests and the build, then deploys
   (`.github/workflows/deploy.yml`). The site works at any path, e.g. `https://<you>.github.io/atlas/`.

Releases: `npm run release -- patch` (see the checklist in `CLAUDE.md`).
