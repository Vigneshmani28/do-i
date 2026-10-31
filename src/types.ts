export type ErrorCode = 'INVALID_NAME' | 'NOT_FOUND' | 'NETWORK' | 'REGISTRY';

/** Expected, user-facing failure. The CLI prints the message without a stack trace. */
export class ShouldIError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ShouldIError';
  }
}

export interface ProjectContext {
  /** False when no package.json could be found. */
  found: boolean;
  name?: string;
  /** Node version the CLI is running on, e.g. "22.1.0". */
  nodeVersion: string;
  /** `engines.node` declared by the project, if any. */
  nodeRange?: string;
  packageManager: string;
  frameworks: string[];
  /** dependencies + devDependencies + peerDependencies of the project. */
  dependencies: Record<string, string>;
}

export interface NpmPackageInfo {
  name: string;
  version: string;
  description: string | null;
  license: string | null;
  lastPublish: Date | null;
  repositoryUrl: string | null;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalPeers: string[];
  nodeEngine: string | null;
  /** Deprecation message if the latest version is deprecated. */
  deprecated: string | null;
  weeklyDownloads: number | null;
}

export interface GithubInfo {
  owner: string;
  repo: string;
  url: string;
  stars: number;
  openIssues: number;
  archived: boolean;
  lastCommit: Date | null;
}

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface SecurityInfo {
  counts: Record<Severity, number>;
  total: number;
}

export interface CompatibilityInfo {
  /** null when there is no project to compare against. */
  score: number | null;
  problems: string[];
}

export interface HealthScores {
  maintenance: number;
  popularity: number | null;
  security: number | null;
  compatibility: number | null;
  overall: number;
}

export type Verdict = 'recommended' | 'caution' | 'avoid';

export interface Finding {
  level: 'good' | 'warn' | 'bad';
  text: string;
}

export interface Recommendation {
  verdict: Verdict;
  findings: Finding[];
}

export interface AnalysisInput {
  pkg: NpmPackageInfo;
  github: GithubInfo | null;
  security: SecurityInfo | null;
  project: ProjectContext;
  now: Date;
}

export interface AnalysisReport {
  pkg: NpmPackageInfo;
  github: GithubInfo | null;
  security: SecurityInfo | null;
  project: ProjectContext;
  compatibility: CompatibilityInfo;
  scores: HealthScores;
  recommendation: Recommendation;
  /** Non-fatal problems (e.g. GitHub unreachable). */
  notices: string[];
}
