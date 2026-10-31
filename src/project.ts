import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ProjectContext } from './types.js';

const FRAMEWORKS: Record<string, string> = {
  react: 'React',
  'react-native': 'React Native',
  next: 'Next.js',
  vue: 'Vue',
  nuxt: 'Nuxt',
  '@angular/core': 'Angular',
  svelte: 'Svelte',
  '@sveltejs/kit': 'SvelteKit',
  'solid-js': 'Solid',
  astro: 'Astro',
  '@remix-run/react': 'Remix',
  express: 'Express',
  fastify: 'Fastify',
  koa: 'Koa',
  hono: 'Hono',
  '@nestjs/core': 'NestJS',
  electron: 'Electron',
  expo: 'Expo',
  vite: 'Vite',
};

const LOCKFILES: Array<[string, string]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

/** Walks up from `startDir` to find the nearest package.json. */
function findPackageJson(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function detectPackageManager(root: string, declared: unknown): string {
  if (typeof declared === 'string') {
    const name = declared.split('@')[0];
    if (name) return name;
  }
  for (const [file, manager] of LOCKFILES) {
    if (existsSync(join(root, file))) return manager;
  }
  return 'npm';
}

export function detectFrameworks(dependencies: Record<string, string>): string[] {
  return Object.entries(FRAMEWORKS)
    .filter(([dep]) => dep in dependencies)
    .map(([, label]) => label);
}

export function detectProject(
  cwd: string = process.cwd(),
  nodeVersion: string = process.versions.node,
): ProjectContext {
  const empty: ProjectContext = {
    found: false,
    nodeVersion,
    packageManager: 'npm',
    frameworks: [],
    dependencies: {},
  };

  const file = findPackageJson(cwd);
  if (!file) return empty;

  let json: Record<string, any>;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return empty;
  }

  const dependencies: Record<string, string> = {
    ...json.peerDependencies,
    ...json.devDependencies,
    ...json.dependencies,
  };

  return {
    found: true,
    name: typeof json.name === 'string' ? json.name : undefined,
    nodeVersion,
    nodeRange: typeof json.engines?.node === 'string' ? json.engines.node : undefined,
    packageManager: detectPackageManager(dirname(file), json.packageManager),
    frameworks: detectFrameworks(dependencies),
    dependencies,
  };
}
