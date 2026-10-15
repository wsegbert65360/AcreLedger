import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
const sources = csp.match(/(?:^|;)\s*connect-src\s+([^;]+)/)?.[1].split(/\s+/) ?? [];

function allows(origin: string, sourceList = sources): boolean {
  const target = new URL(origin);
  return sourceList.some(source => {
    if (!source.startsWith('https://') && !source.startsWith('http://')) return false;
    const wildcard = source.includes('://*.');
    const allowed = new URL(source.replace('://*.', '://'));
    return target.protocol === allowed.protocol && target.port === allowed.port
      && (wildcard ? target.hostname.endsWith('.' + allowed.hostname) : target.hostname === allowed.hostname);
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path)
      : /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

// Parse code (not comments or documentation links). In modules calling fetch or
// fetchImpl, check every literal HTTP origin, including URL/template constants.
function fetchOrigins(code: string): string[] {
  const ast = ts.createSourceFile('module.ts', code, ts.ScriptTarget.Latest, true);
  let fetches = false;
  const origins = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(ast);
      if (/^(?:(?:window|globalThis)\.)?fetch(?:Impl)?$/.test(callee)) fetches = true;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) {
      const match = node.text.match(/^https?:\/\/[^/?#\s$]+/);
      if (match) origins.add(new URL(match[0]).origin);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return fetches ? [...origins] : [];
}

describe('CSP connect-src and hard-coded fetch origins', () => {
  it('allows every hard-coded origin in src/lib modules using fetch', () => {
    expect(sources.length).toBeGreaterThan(0);
    const checked = new Set<string>();
    for (const path of sourceFiles(resolve(process.cwd(), 'src/lib'))) {
      for (const origin of fetchOrigins(readFileSync(path, 'utf8'))) {
        checked.add(origin);
        expect(allows(origin), `${path}: ${origin} is blocked by connect-src`).toBe(true);
      }
    }
    expect(checked).toContain('https://itunes.apple.com');
    expect(checked).toContain('https://nominatim.openstreetmap.org');
  });

  it('matches host, protocol and port without accepting wildcard lookalikes', () => {
    expect(allows('https://farm.supabase.co', ['https://*.supabase.co'])).toBe(true);
    expect(allows('https://supabase.co', ['https://*.supabase.co'])).toBe(false);
    expect(allows('https://farm.supabase.co.evil.test', ['https://*.supabase.co'])).toBe(false);
    expect(allows('http://farm.supabase.co', ['https://*.supabase.co'])).toBe(false);
    expect(allows('https://farm.supabase.co:8443', ['https://*.supabase.co'])).toBe(false);
  });

  it('finds literal and template origins but ignores non-fetch modules and comments', () => {
    expect(fetchOrigins("const url = 'https://one.test/path'; fetch(url);")).toEqual(['https://one.test']);
    expect(fetchOrigins('fetchImpl(`https://two.test/path?x=${x}`);')).toEqual(['https://two.test']);
    expect(fetchOrigins("// https://docs.test\nfetch('/api/test');")).toEqual([]);
    expect(fetchOrigins("const icon = 'https://image.test/icon.png';")).toEqual([]);
  });

  it('does not allow tenant-hosted scripts from Supabase or Vercel storage', () => {
    const scripts = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1] ?? '';
    expect(scripts).not.toContain('https://*.supabase.co');
    expect(scripts).not.toContain('https://*.vercel-storage.com');
  });
});
