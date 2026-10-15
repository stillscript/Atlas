import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

export interface AtlasPwaOptions {
  /** App version from package.json. */
  version: string;
  /** Service worker template, relative to the project root. */
  swTemplate?: string;
}

export interface PrecacheEntry {
  url: string;
  rev: string;
}

/** Build output that must never be precached. */
const EXCLUDE: RegExp[] = [/^sw\.js$/, /^version\.json$/, /\.map$/, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/];

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(abs)));
    else out.push(abs);
  }
  return out;
}

/**
 * Generates `sw.js` after every production build.
 *
 * Every file in the build output is listed with a content hash, and the cache name is derived from
 * those hashes. Any change to any file therefore produces a byte-different `sw.js`, which is what
 * makes browsers install the new worker. Vite already fingerprints JS/CSS/fonts; this covers the
 * files it can't fingerprint (index.html, the manifest, icons).
 */
export function atlasPwa(options: AtlasPwaOptions): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'atlas-pwa',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const entries: PrecacheEntry[] = [];
      for (const abs of await listFiles(outDir)) {
        const rel = relative(outDir, abs).split(sep).join('/');
        if (EXCLUDE.some((re) => re.test(rel))) continue;
        const rev = createHash('sha256').update(await readFile(abs)).digest('hex').slice(0, 16);
        entries.push({ url: `./${rel}`, rev });
      }
      entries.sort((a, b) => a.url.localeCompare(b.url));

      const buildId = createHash('sha256')
        .update(options.version)
        .update(JSON.stringify(entries))
        .digest('hex')
        .slice(0, 12);

      const templatePath = resolve(config.root, options.swTemplate ?? 'src/sw/service-worker.js');
      const template = await readFile(templatePath, 'utf8');
      if (!template.includes('self.__ATLAS_PRECACHE__')) {
        throw new Error('[atlas-pwa] service worker template is missing the self.__ATLAS_PRECACHE__ placeholder');
      }
      const sw = template
        .replace('self.__ATLAS_PRECACHE__', JSON.stringify(entries))
        .replaceAll('__ATLAS_BUILD_ID__', buildId)
        .replaceAll('__ATLAS_VERSION__', options.version);

      await writeFile(join(outDir, 'sw.js'), sw);
      await writeFile(
        join(outDir, 'version.json'),
        JSON.stringify({ version: options.version, buildId, builtAt: new Date().toISOString() }, null, 2),
      );
      config.logger.info(`[atlas-pwa] sw.js: v${options.version}, build ${buildId}, ${entries.length} files precached`);
    },
  };
}
