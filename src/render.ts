import pc from 'picocolors';
import { formatDownloads, timeAgo } from './format.js';
import { VERDICT_LABELS } from './recommendation.js';
import type { AnalysisReport, Verdict } from './types.js';

const RULE = '─'.repeat(24);
const LABEL_WIDTH = 15;

const row = (label: string, value: string) => `${label.padEnd(LABEL_WIDTH)}${value}`;

function colorScore(score: number | null): string {
  if (score === null) return pc.dim('n/a');
  const text = `${score}/100`;
  if (score >= 75) return pc.green(text);
  if (score >= 55) return pc.yellow(text);
  return pc.red(text);
}

const VERDICT_STYLE: Record<Verdict, { icon: string; paint: (s: string) => string }> = {
  recommended: { icon: '🟢', paint: (s) => pc.bold(pc.green(s)) },
  caution: { icon: '🟡', paint: (s) => pc.bold(pc.yellow(s)) },
  avoid: { icon: '🔴', paint: (s) => pc.bold(pc.red(s)) },
};

const FINDING_ICON = {
  good: pc.green('✓'),
  warn: pc.yellow('!'),
  bad: pc.red('✗'),
} as const;

export function renderHeader(name: string): string {
  return `🔍 Analyzing ${pc.bold(name)}...`;
}

export function renderReport(report: AnalysisReport, now: Date = new Date()): string {
  const { pkg, github, scores, project, recommendation } = report;
  const out: string[] = [''];

  out.push(pc.bold('Package'), RULE);
  out.push(row('Version', pkg.version));
  out.push(row('License', pkg.license ?? pc.yellow('none declared')));
  out.push(row('Downloads', formatDownloads(pkg.weeklyDownloads)));
  out.push(row('Last release', timeAgo(pkg.lastPublish, now)));
  if (github) {
    out.push(row('GitHub', `${github.owner}/${github.repo}  ★ ${github.stars.toLocaleString('en-US')}  ${github.openIssues.toLocaleString('en-US')} open issues`));
    out.push(row('Last commit', timeAgo(github.lastCommit, now) + (github.archived ? pc.red('  (archived)') : '')));
  }
  out.push(row('Dependencies', String(Object.keys(pkg.dependencies).length)));
  if (pkg.deprecated) out.push(row('Status', pc.red('DEPRECATED')));

  out.push('', pc.bold('Your project'), RULE);
  if (project.found) {
    out.push(row('Node', project.nodeVersion));
    out.push(row('Pkg manager', project.packageManager));
    out.push(row('Frameworks', project.frameworks.length ? project.frameworks.join(', ') : 'none detected'));
  } else {
    out.push(pc.dim('No package.json found in this directory or its parents.'));
  }

  out.push('', pc.bold('Health'), RULE);
  out.push(row('Maintenance', colorScore(scores.maintenance)));
  out.push(row('Popularity', colorScore(scores.popularity)));
  out.push(row('Security', colorScore(scores.security)));
  out.push(row('Compatibility', colorScore(scores.compatibility)));
  out.push('', pc.bold(row('Overall', colorScore(scores.overall))));

  const style = VERDICT_STYLE[recommendation.verdict];
  out.push('', `${style.icon} ${style.paint(VERDICT_LABELS[recommendation.verdict])}`, '');
  for (const f of recommendation.findings) out.push(`${FINDING_ICON[f.level]} ${f.text}`);

  if (report.notices.length) {
    out.push('', ...report.notices.map((n) => pc.dim(`note: ${n}`)));
  }
  out.push('');
  return out.join('\n');
}

/** JSON-safe view of the report (dates become ISO strings via JSON.stringify). */
export function renderJson(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2);
}
