import { daysBetween, formatDownloads } from './format.js';
import { parseGithubRepo } from './github.js';
import type {
  AnalysisInput,
  CompatibilityInfo,
  Finding,
  HealthScores,
  Recommendation,
  Verdict,
} from './types.js';

export const THRESHOLDS = { recommended: 75, caution: 55 } as const;

const COPYLEFT = /\b(A?GPL|SSPL|EUPL)\b/i;

export function verdictFor(overall: number): Verdict {
  if (overall >= THRESHOLDS.recommended) return 'recommended';
  if (overall >= THRESHOLDS.caution) return 'caution';
  return 'avoid';
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  recommended: 'RECOMMENDED',
  caution: 'USE WITH CAUTION',
  avoid: 'NOT RECOMMENDED',
};

/** Turns scores and raw signals into a verdict plus human-readable findings. */
export function recommend(
  input: AnalysisInput,
  scores: HealthScores,
  compatibility: CompatibilityInfo,
): Recommendation {
  const { pkg, github, security, project, now } = input;
  const findings: Finding[] = [];
  const add = (level: Finding['level'], text: string) => findings.push({ level, text });

  let verdict = verdictFor(scores.overall);

  // Hard overrides: a high average must not hide a disqualifying signal.
  if (pkg.deprecated) {
    verdict = 'avoid';
    add('bad', `Deprecated: ${pkg.deprecated.split('\n')[0]}`);
  }
  if (github?.archived) {
    if (verdict === 'recommended') verdict = 'caution';
    add('bad', 'GitHub repository is archived (no further updates expected)');
  }
  if (security && (security.counts.critical > 0 || security.counts.high > 0)) {
    if (verdict === 'recommended') verdict = 'caution';
    const n = security.counts.critical + security.counts.high;
    add('bad', `${n} high/critical known ${n === 1 ? 'vulnerability' : 'vulnerabilities'} in v${pkg.version}`);
  } else if (security && security.total > 0) {
    add('warn', `${security.total} known low/moderate ${security.total === 1 ? 'vulnerability' : 'vulnerabilities'} in v${pkg.version}`);
  } else if (security) {
    add('good', 'No known vulnerabilities');
  }

  if (!pkg.deprecated && !github?.archived) {
    const release = pkg.lastPublish ? daysBetween(pkg.lastPublish, now) : null;
    const commit = github?.lastCommit ? daysBetween(github.lastCommit, now) : null;
    if (scores.maintenance >= 80) add('good', 'Actively maintained');
    else if (release !== null && release > 365) add('warn', 'No release in over a year');
    else if (commit !== null && commit > 365) add('warn', 'No repository activity in over a year');
    else if (scores.maintenance < 60) add('warn', 'Maintenance activity is low');
  }

  if (scores.popularity !== null) {
    if (scores.popularity >= 70) add('good', `Popular package (${formatDownloads(pkg.weeklyDownloads)})`);
    else if (scores.popularity < 30) add('warn', `Low adoption (${formatDownloads(pkg.weeklyDownloads)})`);
  }

  // A linked-but-unreachable repo is reported via report.notices instead.
  if (!github && !parseGithubRepo(pkg.repositoryUrl)) {
    add('warn', 'No GitHub repository linked, so repository activity could not be checked');
  }

  if (!pkg.license) add('warn', 'No license declared');
  else if (COPYLEFT.test(pkg.license)) add('warn', `Copyleft license (${pkg.license}); check it fits your project`);

  const depCount = Object.keys(pkg.dependencies).length;
  if (depCount > 20) add('warn', `Pulls in ${depCount} direct dependencies`);
  else if (depCount === 0) add('good', 'Zero dependencies');

  for (const problem of compatibility.problems) add('warn', problem);
  if (compatibility.score !== null && compatibility.problems.length === 0) {
    add('good', 'Compatible with your project');
  } else if (compatibility.score === null) {
    add('warn', 'No package.json found, so project compatibility was not checked');
  }

  const order = { bad: 0, warn: 1, good: 2 } as const;
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return { verdict, findings };
}
