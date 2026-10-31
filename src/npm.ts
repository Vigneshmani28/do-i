import { ShouldIError } from './types.js';
import type { NpmPackageInfo, SecurityInfo, Severity } from './types.js';

const REGISTRY = 'https://registry.npmjs.org';
const DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-week';
const TIMEOUT_MS = 10_000;

const NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export function validatePackageName(name: string): void {
  if (!name || name.length > 214 || !NAME_PATTERN.test(name)) {
    const hint = /@.+@|^[^@].*@/.test(name)
      ? ' Version specifiers such as "pkg@1.2.3" are not supported yet; pass just the name.'
      : '';
    throw new ShouldIError('INVALID_NAME', `"${name}" is not a valid npm package name.${hint}`);
  }
}

/** fetch with a timeout; network-level failures become a ShouldIError. */
export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (cause) {
    const host = new URL(url).host;
    throw new ShouldIError(
      'NETWORK',
      `Could not reach ${host}. Check your internet connection and try again.`,
      { cause },
    );
  }
}

function normalizeLicense(doc: any): string | null {
  const raw = doc?.license ?? doc?.licenses;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw.type === 'string') return raw.type;
  if (Array.isArray(raw)) {
    const types = raw.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean);
    return types.length ? types.join(' OR ') : null;
  }
  return null;
}

function normalizeRepository(doc: any): string | null {
  const repo = doc?.repository;
  if (typeof repo === 'string') return repo;
  if (repo && typeof repo.url === 'string') return repo.url;
  return null;
}

/** Builds NpmPackageInfo from a full registry document (without downloads). */
export function parseRegistryDocument(name: string, doc: any): NpmPackageInfo {
  const version: string | undefined = doc?.['dist-tags']?.latest;
  const latest = version ? doc.versions?.[version] : undefined;
  if (!version || !latest) {
    throw new ShouldIError('NOT_FOUND', `"${name}" has no published versions (it may have been unpublished).`);
  }

  const peerMeta = latest.peerDependenciesMeta ?? {};
  const published = doc.time?.[version];

  return {
    name,
    version,
    description: latest.description ?? doc.description ?? null,
    license: normalizeLicense(latest) ?? normalizeLicense(doc),
    lastPublish: published ? new Date(published) : null,
    repositoryUrl: normalizeRepository(latest) ?? normalizeRepository(doc),
    dependencies: latest.dependencies ?? {},
    peerDependencies: latest.peerDependencies ?? {},
    optionalPeers: Object.keys(peerMeta).filter((p) => peerMeta[p]?.optional),
    nodeEngine: typeof latest.engines?.node === 'string' ? latest.engines.node : null,
    deprecated: typeof latest.deprecated === 'string' && latest.deprecated ? latest.deprecated : null,
    weeklyDownloads: null,
  };
}

export async function fetchWeeklyDownloads(name: string): Promise<number | null> {
  try {
    const res = await request(`${DOWNLOADS}/${name}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { downloads?: number };
    return typeof body.downloads === 'number' ? body.downloads : null;
  } catch {
    return null;
  }
}

/** Known advisories affecting this exact version of the package (not its dependency tree). */
export async function fetchSecurity(name: string, version: string): Promise<SecurityInfo | null> {
  try {
    const res = await request(`${REGISTRY}/-/npm/v1/security/advisories/bulk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [name]: [version] }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, Array<{ severity?: string }>>;
    const counts: Record<Severity, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
    for (const advisory of body[name] ?? []) {
      if (advisory.severity && advisory.severity in counts) counts[advisory.severity as Severity]++;
    }
    return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  } catch {
    return null;
  }
}

export async function fetchNpmPackage(name: string): Promise<NpmPackageInfo> {
  validatePackageName(name);

  const res = await request(`${REGISTRY}/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/json' },
  });
  if (res.status === 404) {
    throw new ShouldIError('NOT_FOUND', `Package "${name}" was not found on npm.`);
  }
  if (!res.ok) {
    throw new ShouldIError('REGISTRY', `The npm registry responded with HTTP ${res.status}. Try again later.`);
  }

  let doc: unknown;
  try {
    doc = await res.json();
  } catch (cause) {
    throw new ShouldIError('REGISTRY', 'The npm registry returned an unreadable response.', { cause });
  }

  const info = parseRegistryDocument(name, doc);
  info.weeklyDownloads = await fetchWeeklyDownloads(name);
  return info;
}
