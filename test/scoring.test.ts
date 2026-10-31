import { describe, expect, it } from 'vitest';
import { buildReport, checkCompatibility, popularityScore, recencyScore } from '../src/analyzer.js';
import type { AnalysisInput, NpmPackageInfo, ProjectContext } from '../src/types.js';

const now = new Date('2026-01-01T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

const pkg = (over: Partial<NpmPackageInfo> = {}): NpmPackageInfo => ({
  name: 'demo',
  version: '1.0.0',
  description: null,
  license: 'MIT',
  lastPublish: daysAgo(10),
  repositoryUrl: null,
  dependencies: {},
  peerDependencies: {},
  optionalPeers: [],
  nodeEngine: null,
  deprecated: null,
  weeklyDownloads: 5_000_000,
  ...over,
});

const project = (over: Partial<ProjectContext> = {}): ProjectContext => ({
  found: true,
  nodeVersion: '22.0.0',
  packageManager: 'npm',
  frameworks: [],
  dependencies: {},
  ...over,
});

const input = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  pkg: pkg(),
  github: null,
  security: null,
  project: project(),
  now,
  ...over,
});

describe('score helpers', () => {
  it('scores recency in decreasing steps', () => {
    expect(recencyScore(5)).toBe(100);
    expect(recencyScore(200)).toBe(70);
    expect(recencyScore(5000)).toBe(10);
  });

  it('scores popularity on a log scale', () => {
    expect(popularityScore(0)).toBe(0);
    expect(popularityScore(100)).toBe(0);
    expect(popularityScore(100_000)).toBe(60);
    expect(popularityScore(50_000_000)).toBe(100);
  });
});

describe('checkCompatibility', () => {
  it('returns null score without a project', () => {
    expect(checkCompatibility(pkg(), project({ found: false })).score).toBeNull();
  });

  it('flags unsupported Node versions', () => {
    const result = checkCompatibility(pkg({ nodeEngine: '>=24' }), project());
    expect(result.score).toBe(50);
    expect(result.problems[0]).toMatch(/Requires Node >=24/);
  });

  it('flags missing and conflicting peers, ignores optional ones', () => {
    const p = pkg({
      peerDependencies: { react: '^18.0.0', vue: '^3.0.0', ws: '*' },
      optionalPeers: ['ws'],
    });
    const result = checkCompatibility(p, project({ dependencies: { react: '^17.0.0' } }));
    expect(result.problems).toHaveLength(2);
    expect(result.score).toBe(65);
  });
});

describe('buildReport', () => {
  it('recommends a healthy package', () => {
    const report = buildReport(input({ security: { counts: { low: 0, moderate: 0, high: 0, critical: 0 }, total: 0 } }));
    expect(report.recommendation.verdict).toBe('recommended');
    expect(report.scores.overall).toBeGreaterThanOrEqual(75);
  });

  it('never recommends a deprecated package', () => {
    const report = buildReport(input({ pkg: pkg({ deprecated: 'use something else' }) }));
    expect(report.recommendation.verdict).toBe('avoid');
    expect(report.recommendation.findings[0]?.level).toBe('bad');
  });

  it('downgrades archived repositories', () => {
    const github = { owner: 'a', repo: 'b', url: '', stars: 1, openIssues: 0, archived: true, lastCommit: daysAgo(1) };
    const report = buildReport(input({ github }));
    expect(report.recommendation.verdict).not.toBe('recommended');
  });

  it('handles missing optional data by renormalising', () => {
    const report = buildReport(input({ pkg: pkg({ weeklyDownloads: null }), project: project({ found: false }) }));
    expect(report.scores.popularity).toBeNull();
    expect(report.scores.compatibility).toBeNull();
    expect(report.scores.overall).toBe(100);
  });
});

describe('missing GitHub data', () => {
  const text = (r: ReturnType<typeof buildReport>) => r.recommendation.findings.map((f) => f.text).join('\n');

  it('only says "no repository" when none is linked', () => {
    expect(text(buildReport(input()))).toMatch(/No GitHub repository linked/);
    const linked = input({ pkg: pkg({ repositoryUrl: 'git+https://github.com/o/r.git' }) });
    expect(text(buildReport(linked))).not.toMatch(/No GitHub repository linked/);
  });
});
