import { request } from './npm.js';
import { ShouldIError } from './types.js';
import type { GithubInfo } from './types.js';

const API = 'https://api.github.com';

/** Extracts owner/repo from the many URL shapes found in package.json `repository`. */
export function parseGithubRepo(input: string | null | undefined): { owner: string; repo: string } | null {
  if (!input) return null;
  let value = input.trim().replace(/^git\+/, '');

  if (value.startsWith('github:')) value = value.slice('github:'.length);
  else if (/^[\w.-]+\/[\w.-]+$/.test(value)) value = `https://github.com/${value}`;
  else if (value.startsWith('git@github.com:')) value = `https://github.com/${value.slice('git@github.com:'.length)}`;

  if (!value.includes('://')) value = `https://github.com/${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;

  const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, '');
  return owner && repo ? { owner, repo } : null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'do-i-cli',
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/**
 * Fetches basic repository stats. Returns null when the URL is not a GitHub repo;
 * throws ShouldIError when GitHub itself cannot be queried (rate limit, 404, network).
 */
export async function fetchGithubInfo(repositoryUrl: string | null): Promise<GithubInfo | null> {
  const parsed = parseGithubRepo(repositoryUrl);
  if (!parsed) return null;
  const { owner, repo } = parsed;

  const res = await request(`${API}/repos/${owner}/${repo}`, { headers: headers() });
  if (res.status === 404) throw new ShouldIError('NOT_FOUND', `GitHub repository ${owner}/${repo} was not found.`);
  if (res.status === 403 || res.status === 429) {
    throw new ShouldIError('REGISTRY', 'GitHub API rate limit reached. Set GITHUB_TOKEN to raise the limit.');
  }
  if (!res.ok) throw new ShouldIError('REGISTRY', `GitHub responded with HTTP ${res.status}.`);

  const data = (await res.json()) as {
    stargazers_count: number;
    open_issues_count: number;
    archived: boolean;
    pushed_at?: string;
    html_url: string;
    default_branch?: string;
  };

  let lastCommit: Date | null = data.pushed_at ? new Date(data.pushed_at) : null;
  try {
    const commits = await request(`${API}/repos/${owner}/${repo}/commits?per_page=1`, { headers: headers() });
    if (commits.ok) {
      const [latest] = (await commits.json()) as Array<{ commit?: { committer?: { date?: string } } }>;
      const date = latest?.commit?.committer?.date;
      if (date) lastCommit = new Date(date);
    }
  } catch {
    // fall back to pushed_at
  }

  return {
    owner,
    repo,
    url: data.html_url,
    stars: data.stargazers_count,
    openIssues: data.open_issues_count,
    archived: data.archived,
    lastCommit,
  };
}
