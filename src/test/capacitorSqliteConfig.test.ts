import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('native SQLite encryption config', () => {
  it('keeps iOS encryption explicitly on in capacitor.config.ts', () => {
    const source = readFileSync(resolve(repoRoot, 'capacitor.config.ts'), 'utf8');
    expect(source).toMatch(/iosIsEncryption:\s*true/);
  });

  it('verifies the generated iOS config in the release workflow', () => {
    const workflow = readFileSync(resolve(repoRoot, 'codemagic.yaml'), 'utf8');
    expect(workflow).toContain('ios/App/App/capacitor.config.json');
    expect(workflow).toContain('iosIsEncryption');
  });
});
