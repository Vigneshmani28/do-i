import { intersects, satisfies, validRange } from 'semver';
import { daysBetween } from './format.js';
import { fetchGithubInfo } from './github.js';
import { fetchNpmPackage, fetchSecurity } from './npm.js';
import { detectProject } from './project.js';
import { recommend } from './recommendation.js';
import { ShouldIError } from './types.js';
import type {
  AnalysisInput,
  AnalysisReport,
  CompatibilityInfo,
  HealthScores,
  NpmPackageInfo,
  ProjectContext,
  SecurityInfo,
} from './types.js';

const WEIGHTS = { maintenance: 0.35, popularity: 0.2, security: 0.2, compatibility: 0.25 } as const;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Score for "how long ago did something last happen". */
export function recencyScore(days: number): number {
  const steps: Array<[number, number]> = [
    [30, 100],
    [90, 95],
    [180, 85],
    [365, 70],
    [730, 45],
    [1095, 25],
  ];
  for (const [limit, score] of steps) if (days <= limit) return score;
  return 10;
}

/** Log scale: 100 downloads/week -> 0, 10M+/week -> 100. */
export function popularityScore(weeklyDownloads: number): number {
  if (weeklyDownloads <= 0) return 0;
  return clamp(((Math.log10(weeklyDownloads) - 2) / 5) * 100);
}

export function securityScore(security: SecurityInfo): number {
  const { critical, high, moderate, low } = security.counts;
  return clamp(100 - critical * 50 - high * 30 - moderate * 12 - low * 4);
}

export function maintenanceScore(input: AnalysisInput): number {
  const { pkg, github, now } = input;
  const release = pkg.lastPublish ? recencyScore(daysBetween(pkg.lastPublish, now)) : 10;
  if (!github) return release;
  if (github.archived) return Math.min(release, 5);
  const commit = github.lastCommit ? recencyScore(daysBetween(github.lastCommit, now)) : 10;
  return clamp((release + commit) / 2);
}

export function checkCompatibility(pkg: NpmPackageInfo, project: ProjectContext): CompatibilityInfo {
  if (!project.found) return { score: null, problems: [] };

  const problems: string[] = [];
  let score = 100;

  if (pkg.nodeEngine && validRange(pkg.nodeEngine)) {
    if (!satisfies(project.nodeVersion, pkg.nodeEngine)) {
      score -= 50;
      problems.push(`Requires Node ${pkg.nodeEngine}, but you are on ${project.nodeVersion}`);
    } else if (project.nodeRange && validRange(project.nodeRange) && !intersects(project.nodeRange, pkg.nodeEngine)) {
      score -= 30;
      problems.push(`Requires Node ${pkg.nodeEngine}, but your engines field (${project.nodeRange}) does not overlap`);
    }
  }

  for (const [peer, range] of Object.entries(pkg.peerDependencies)) {
    if (pkg.optionalPeers.includes(peer)) continue;
    const installed = project.dependencies[peer];
    if (!installed) {
      score -= 15;
      problems.push(`Needs peer dependency ${peer}@${range}, which your project does not have`);
      continue;
    }
    try {
      if (validRange(range) && validRange(installed) && !intersects(installed, range)) {
        score -= 20;
        problems.push(`Peer dependency ${peer}@${range} conflicts with your ${peer}@${installed}`);
      }
    } catch {
      // unparseable range (e.g. a git URL); skip
    }
  }

  return { score: clamp(score), problems };
}

/** Weighted average over the components that are available. */
export function overallScore(parts: {
  maintenance: number;
  popularity: number | null;
  security: number | null;
  compatibility: number | null;
}): number {
  let total = 0;
  let weight = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    const value = parts[key];
    if (value === null) continue;
    total += value * WEIGHTS[key];
    weight += WEIGHTS[key];
  }
  return clamp(total / weight);
}

/** Pure scoring step: no I/O, easy to test. */
export function buildReport(input: AnalysisInput, notices: string[] = []): AnalysisReport {
  const compatibility = checkCompatibility(input.pkg, input.project);
  const parts = {
    maintenance: maintenanceScore(input),
    popularity: input.pkg.weeklyDownloads === null ? null : popularityScore(input.pkg.weeklyDownloads),
    security: input.security ? securityScore(input.security) : null,
    compatibility: compatibility.score,
  };
  const scores: HealthScores = { ...parts, overall: overallScore(parts) };
  return {
    pkg: input.pkg,
    github: input.github,
    security: input.security,
    project: input.project,
    compatibility,
    scores,
    recommendation: recommend(input, scores, compatibility),
    notices,
  };
}

/** Fetches everything needed and produces the report. */
export async function analyze(name: string, cwd: string = process.cwd()): Promise<AnalysisReport> {
  const project = detectProject(cwd);
  const pkg = await fetchNpmPackage(name);
  const notices: string[] = [];

  const [github, security] = await Promise.all([
    fetchGithubInfo(pkg.repositoryUrl).catch((err: unknown) => {
      notices.push(`GitHub data skipped: ${err instanceof ShouldIError ? err.message : 'request failed'}`);
      return null;
    }),
    fetchSecurity(pkg.name, pkg.version),
  ]);

  return buildReport({ pkg, github, security, project, now: new Date() }, notices);
}
