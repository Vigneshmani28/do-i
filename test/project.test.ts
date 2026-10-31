import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectProject } from '../src/project.js';
import { formatDownloads, timeAgo } from '../src/format.js';

describe('detectProject', () => {
  it('detects frameworks, package manager and node range', () => {
    const dir = mkdtempSync(join(tmpdir(), 'should-i-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'app', engines: { node: '>=20' }, dependencies: { react: '^18', next: '^14' } }),
    );
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    const ctx = detectProject(dir, '22.0.0');
    expect(ctx).toMatchObject({ found: true, name: 'app', nodeRange: '>=20', packageManager: 'pnpm', nodeVersion: '22.0.0' });
    expect(ctx.frameworks).toEqual(['React', 'Next.js']);
  });

  it('reports not found when there is no package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'should-i-'));
    // parent dirs of tmpdir are very unlikely to contain a package.json
    expect(detectProject(dir).found).toBe(false);
  });
});

describe('format', () => {
  it('formats downloads', () => {
    expect(formatDownloads(40_200_000)).toBe('40.2M/week');
    expect(formatDownloads(12_500)).toBe('12.5K/week');
    expect(formatDownloads(42)).toBe('42/week');
  });

  it('formats relative time', () => {
    const now = new Date('2026-01-31T00:00:00Z');
    expect(timeAgo(new Date('2026-01-19T00:00:00Z'), now)).toBe('12 days ago');
    expect(timeAgo(null, now)).toBe('unknown');
  });
});
