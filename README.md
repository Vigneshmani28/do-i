# do-i

Quick health check for an npm package, before you install it.

```bash
npx @vigneshmani/do-i install axios
```

```
🔍 Analyzing axios...

Package
────────────────────────
Version        1.x.x
License        MIT
Downloads      146M/week
Last release   4 days ago
...
Health
────────────────────────
Maintenance    100/100
Popularity     100/100
Security       100/100
Compatibility  100/100

Overall        100/100

🟢 RECOMMENDED

✓ No known vulnerabilities
✓ Actively maintained
✓ Popular package (146M/week)
✓ Compatible with your project
```

## Usage

```bash
do-i install <package-name> [--json]
```

Run it inside a project: it reads the nearest `package.json` to detect your Node version, package manager and frameworks, and checks the package's `engines` and `peerDependencies` against them. Outside a project it still works; compatibility is just reported as `n/a`.

Data sources: the npm registry (metadata, downloads, advisories for that exact version) and the GitHub API (stars, issues, archived flag, last commit). Set `GITHUB_TOKEN` to avoid GitHub's unauthenticated rate limit (60 requests/hour). If GitHub is unreachable the analysis still completes without it.

### How the score works

| Component | Based on |
| --- | --- |
| Maintenance (35%) | Time since last npm release and last GitHub commit; archived repos score ~0 |
| Popularity (20%) | Weekly downloads on a log scale (100 → 0, 10M+ → 100) |
| Security (20%) | Known advisories for the installed version (not transitive dependencies) |
| Compatibility (25%) | Node `engines` vs. your Node, missing/conflicting peer dependencies |

Unavailable components are left out and the weights renormalised. Verdicts: 🟢 ≥ 75, 🟡 55–74, 🔴 < 55. A deprecated package is always 🔴; an archived repo or high/critical advisory caps the verdict at 🟡. The thresholds and curves are heuristics: see `src/analyzer.ts` and `src/recommendation.ts`.

## Local development

Requires Node 18+.

```bash
npm install
npm run build        # compile src/ -> dist/
node bin/do-i.js install axios
npm test             # vitest
npm run typecheck
npm run dev          # tsc --watch
npm link             # optional: makes `do-i` available globally
```

Layout:

```
src/
  cli.ts             Commander setup and error handling
  npm.ts             npm registry / downloads / advisories
  github.ts          GitHub repo info and URL parsing
  project.ts         package.json detection (Node, package manager, frameworks)
  analyzer.ts        scoring + orchestration (buildReport is pure)
  recommendation.ts  verdict and findings
  render.ts, format.ts   terminal output
  types.ts
bin/do-i.js      executable entry point
```

New commands (`compare`, `analyze`) go in `buildProgram()` in `src/cli.ts` and can reuse `analyze()` / `buildReport()`.

## Publishing to npm

1. `npm login`
2. `npm test && npm run build && npm pack --dry-run`
3. `npm publish --access public`
4. Verify from another folder: `npx @vigneshmani/do-i install axios`

Later releases: `npm version patch && npm publish` (also update the version string in `src/cli.ts`).
# do-i
