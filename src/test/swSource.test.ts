import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'src/sw.js'), 'utf8');

describe('service worker navigation strategy', () => {
  it('delegates routing to installRoutes and the injected precache manifest', () => {
    expect(source).toContain('installRoutes(self.__WB_MANIFEST)');
    expect(source).not.toContain('precacheAndRoute');
    expect(source).not.toContain('NetworkFirst');
    expect(source).not.toContain('al-navigations');
    expect(source).not.toContain('createHandlerBoundToURL');
  });

  it('still activates immediately', () => {
    expect(source).toContain('skipWaiting');
    expect(source).toContain('clients.claim');
  });
});
