import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGithubRepo } from '../src/github.js';
import { fetchNpmPackage, parseRegistryDocument, validatePackageName } from '../src/npm.js';
import { ShouldIError } from '../src/types.js';

afterEach(() => vi.unstubAllGlobals());

describe('validatePackageName', () => {
  it.each(['axios', '@types/node', 'left-pad', 'lodash.get'])('accepts %s', (n) => {
    expect(() => validatePackageName(n)).not.toThrow();
  });

  it.each(['', 'Bad Name', '.hidden', '_private', 'UPPER', '../etc', 'a'.repeat(215)])('rejects %j', (n) => {
    expect(() => validatePackageName(n)).toThrow(ShouldIError);
  });
});

describe('parseRegistryDocument', () => {
  const doc = {
    'dist-tags': { latest: '2.0.0' },
    time: { '2.0.0': '2025-06-01T00:00:00.000Z' },
    versions: {
      '2.0.0': {
        license: { type: 'MIT' },
        repository: { url: 'git+https://github.com/o/r.git' },
        dependencies: { a: '^1' },
        engines: { node: '>=18' },
        deprecated: 'old',
      },
    },
  };

  it('extracts the latest version metadata', () => {
    const info = parseRegistryDocument('demo', doc);
    expect(info).toMatchObject({
      version: '2.0.0',
      license: 'MIT',
      repositoryUrl: 'git+https://github.com/o/r.git',
      nodeEngine: '>=18',
      deprecated: 'old',
    });
    expect(info.lastPublish?.toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });

  it('rejects unpublished packages', () => {
    expect(() => parseRegistryDocument('demo', { versions: {} })).toThrow(/no published versions/);
  });
});

describe('fetchNpmPackage errors', () => {
  it('reports a missing package', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    await expect(fetchNpmPackage('nope-nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reports network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(fetchNpmPackage('axios')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('rejects invalid names before any request', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(fetchNpmPackage('Bad Name')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('parseGithubRepo', () => {
  it.each([
    ['git+https://github.com/axios/axios.git', 'axios', 'axios'],
    ['https://github.com/axios/axios/tree/main', 'axios', 'axios'],
    ['git://github.com/o/r.git', 'o', 'r'],
    ['git@github.com:o/r.git', 'o', 'r'],
    ['github:o/r', 'o', 'r'],
    ['o/r', 'o', 'r'],
  ])('parses %s', (url, owner, repo) => {
    expect(parseGithubRepo(url)).toEqual({ owner, repo });
  });

  it.each([null, '', 'https://gitlab.com/o/r', 'https://github.com/onlyowner'])('returns null for %j', (url) => {
    expect(parseGithubRepo(url)).toBeNull();
  });
});
