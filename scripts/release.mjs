// Release: npm run release -- <patch|minor|major|x.y.z>
//
// 1. Checks CHANGELOG.md has Highlights under "## [Unreleased]" (they become the in-app What's new).
// 2. Runs the typecheck and all tests, including the migration tests. Stops on any failure.
// 3. Bumps the version (package.json + lockfile), dates the changelog section, and builds.
// 4. Prints the git commands to publish. Pushing to main deploys to GitHub Pages.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const write = (file, text) => writeFileSync(new URL(file, root), text);
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root });

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const parse = (v) => v.split('.').map((n) => Number.parseInt(n, 10));
const compare = (a, b) => {
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};

const arg = process.argv[2];
if (!arg) fail('Say what kind of release: npm run release -- patch | minor | major | 1.2.3');

const pkg = JSON.parse(read('package.json'));
const current = pkg.version;
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else {
  const [major, minor, patch] = parse(current);
  if (arg === 'major') next = `${major + 1}.0.0`;
  else if (arg === 'minor') next = `${major}.${minor + 1}.0`;
  else if (arg === 'patch') next = `${major}.${minor}.${patch + 1}`;
  else fail(`Unknown release type "${arg}"`);
}

const changelog = read('CHANGELOG.md');
if (changelog.includes(`## [${next}]`)) fail(`CHANGELOG.md already has a section for ${next}.`);
if (compare(next, current) < 0) fail(`${next} is older than the current version ${current}.`);
// The very first release keeps the starting version (1.0.0); every later one must be newer.
if (compare(next, current) === 0 && /^## \[\d+\.\d+\.\d+\]/m.test(changelog)) {
  fail(`${next} is the current version and has already been released. Use patch, minor or major.`);
}

const unreleased = /## \[Unreleased\]\r?\n([\s\S]*?)(?=\r?\n## \[|$)/.exec(changelog);
if (!unreleased) fail('CHANGELOG.md has no "## [Unreleased]" section.');
const body = unreleased[1];
const highlights = /### Highlights\r?\n((?:[-*] .+\r?\n?)+)/.exec(body);
if (!highlights) fail('Add at least one bullet under "### Highlights" in the Unreleased section first. It becomes the What\'s new sheet.');

console.log(`\nReleasing Atlas ${current} → ${next}\n`);
console.log('Checking types and running tests (including migration tests)…');
run('npm run typecheck');
run('npm test');

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
write(
  'CHANGELOG.md',
  changelog.replace(unreleased[0], `## [Unreleased]\n\n## [${next}] - ${date}\n${body.trimEnd()}\n`),
);

if (next !== current) run(`npm version ${next} --no-git-tag-version`);

console.log('\nBuilding…');
run('npm run build');

console.log(`
✔ Atlas ${next} is built and ready.

Publish it:
  git add -A
  git commit -m "Release v${next}"
  git tag v${next}
  git push --follow-tags

GitHub Actions then deploys to GitHub Pages. Installed copies pick it up on their next launch
(or via the "Update ready" banner).
`);
