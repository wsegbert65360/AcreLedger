import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(resolve(root, 'codemagic.yaml'), 'utf8');
const nightly = readFileSync(resolve(root, 'scripts/ci/codemagic-nightly.sh'), 'utf8');
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/sh.exe' : '/bin/sh';

function run(source: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'codemagic-test-'));
  try {
    return spawnSync(shell, ['-c', source], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CODEMAGIC_API_TOKEN: 'test-only',
        CI_COMMIT_SHA: 'lab',
        GITHUB_SYNC_TOKEN: 'fake-github-token',
        GITLAB_SYNC_TOKEN: 'fake-gitlab-token',
        TEST_DIR: dir.split('\\').join('/'),
        ...env,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!existsSync(shell))('Codemagic CI decisions', () => {
  const sync = nightly.split('for WF in')[0];
  const fixtures = `
curl() {
  if [ -f "$TEST_DIR/read" ]; then echo "$API_AFTER"; else
    touch "$TEST_DIR/read"; echo "$API_BEFORE"
  fi
}
jq() { cat; }
git() {
  case "$*" in
    *fetch*) [ "\${FETCH_FAIL:-0}" != 1 ] ;;
    *rev-parse*github*) echo "$HUB" ;;
    *rev-parse*gitlab*) echo "$LAB" ;;
    *merge-base*)
      case "$ANCESTRY:$*" in
        lab-ahead:*"hub lab"*) return 0 ;;
        hub-ahead:*"lab hub"*) return 0 ;;
        *) return 1 ;;
      esac ;;
    *push*) echo "$*" >> "$TEST_DIR/pushes"; [ "\${PUSH_FAIL:-0}" != 1 ] ;;
    *) return 0 ;;
  esac
}
`;
  const defaults = {
    API_BEFORE: 'hub', API_AFTER: 'lab', HUB: 'hub', LAB: 'lab', ANCESTRY: 'lab-ahead',
  };
  function syncRun(env: Record<string, string> = {}) {
    return run(fixtures + sync + '\necho "RESULT=$SHA"\ncat "$TEST_DIR/pushes" 2>/dev/null || true', {
      ...defaults, ...env,
    });
  }

  it('keeps email publishing while disabling Play upload and ignoring local secrets', () => {
    const android = workflow.split('  acreledger-ios:')[0];
    expect(android).not.toMatch(/^\s*(?:- google_play|google_play:)/m);
    expect(android).toContain('email:');
    expect(android).toContain('re-add group+publishing then');
    expect(readFileSync(resolve(root, '.gitignore'), 'utf8')).toContain(
      '# Local secrets (never commit)\nCodemagic secret.txt',
    );
    const ci = readFileSync(resolve(root, '.gitlab-ci.yml'), 'utf8');
    expect(ci).toContain('apk add --no-cache curl jq git');
    expect(ci).toContain('GITHUB_SYNC_TOKEN');
    expect(ci).toContain('GITLAB_SYNC_TOKEN');
  });

  it.each([
    ['', '', '42', false],
    ['', '90', '90', false],
    ['present', '', '8', true],
  ])('chooses version code with credentials=%s override=%s', (credentials, override, expected, callsPlay) => {
    const step = workflow.split('      - name: Set Android version code\n        script: |\n')[1]
      .split('\n      - name:')[0].replace(/^ {10}/gm, '');
    const result = run('CM_ENV="$TEST_DIR/env"\n'
      // dash rejects hyphenated function names, so stub google-play on PATH.
      + 'printf "#!/bin/sh\\necho 7\\n" > "$TEST_DIR/google-play"; chmod +x "$TEST_DIR/google-play"; PATH="$TEST_DIR:$PATH"\n' + step + '\ncat "$CM_ENV"', {
      GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS: credentials,
      ANDROID_VERSION_CODE_OVERRIDE: override,
      BUILD_NUMBER: '42',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('VERSION_CODE=' + expected);
    // The Play lookup suppresses stderr; a returned code of 8 proves it ran.
    if (callsPlay) expect(result.stdout).toContain('VERSION_CODE=8');
  });

  it('continues without sync tokens when mains already match', () => {
    const result = syncRun({ API_BEFORE: 'lab', GITHUB_SYNC_TOKEN: '', GITLAB_SYNC_TOKEN: '' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RESULT=lab');
    expect(result.stdout).not.toContain('push ');
  });

  it.each([
    ['lab-ahead', 'lab', 'github.com'],
    ['hub-ahead', 'hub', 'gitlab.com'],
  ])('fast-forwards the lagging remote for %s', (ancestry, sha, host) => {
    const result = syncRun({ ANCESTRY: ancestry, API_AFTER: sha });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RESULT=' + sha);
    expect(result.stdout).toContain('push https://' + host);
    expect(result.stdout).not.toContain('--force');
    expect(result.stdout + result.stderr).not.toContain('fake-github-token');
    expect(result.stdout + result.stderr).not.toContain('fake-gitlab-token');
  });

  it.each([
    [{ GITHUB_SYNC_TOKEN: '' }, 'missing sync tokens'],
    [{ GITLAB_SYNC_TOKEN: '' }, 'missing sync tokens'],
    [{ FETCH_FAIL: '1' }, 'GitHub fetch failed'],
    [{ ANCESTRY: 'diverged' }, 'main branches diverged'],
    [{ PUSH_FAIL: '1' }, 'GitHub fast-forward push failed'],
    [{ ANCESTRY: 'hub-ahead', PUSH_FAIL: '1' }, 'GitLab fast-forward push failed'],
    [{ API_AFTER: 'new-head' }, 'GitHub main changed after sync'],
  ])('fails before builds on %j', (env, reason) => {
    const result = syncRun(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NIGHTLY FAILED: GitLab main lab != GitHub main');
    expect(result.stderr).toContain(reason);
    expect(result.stdout).not.toContain('RESULT=');
    expect(result.stdout + result.stderr).not.toContain('fake-github-token');
    expect(result.stdout + result.stderr).not.toContain('fake-gitlab-token');
  });
});
