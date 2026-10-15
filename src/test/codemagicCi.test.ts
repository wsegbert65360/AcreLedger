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
    expect(ci).toContain('$CI_PIPELINE_SOURCE == "schedule"');
    expect(ci).not.toContain('- if: $CI_MERGE_REQUEST_IID');
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

  function logicalLines(script: string): string[] {
    const lines = script.split('\n');
    const out: string[] = [];
    let current = '';
    for (const line of lines) {
      if (line.endsWith('\\')) current += line.slice(0, -1);
      else {
        out.push(current + line);
        current = '';
      }
    }
    if (current) out.push(current);
    return out;
  }

  it('fails closed when a Codemagic list or start call cannot be confirmed', () => {
    const loop = nightly.slice(nightly.indexOf('for WF in'));
    const curlLines = logicalLines(loop).filter((line) => /\bcurl\s+-/.test(line));
    expect(nightly.startsWith('#!/bin/sh\n')).toBe(true);
    expect(nightly).not.toMatch(/\bpipefail\b/);
    expect(nightly).not.toMatch(/echo\b[^\n]*\$(AUTH|CODEMAGIC_API_TOKEN)\b/);
    expect(curlLines.length).toBe(2);
    for (const line of curlLines) {
      expect(line).toContain('||');
      expect(line).not.toMatch(/\|\s*jq\b/);
    }
    expect(loop).toContain("jq -er '.buildId | select(type == \"string\" and length > 0)'");
    expect(loop).toContain('echo "$WF: started build $BUILD_ID"');
    expect(loop).toContain('NIGHTLY FAILED: $WF cannot list builds');
    expect(loop).toContain('NIGHTLY FAILED: $WF cannot parse builds');
    expect(loop).toContain('NIGHTLY FAILED: $WF cannot read active builds');
    expect(loop).toContain('NIGHTLY FAILED: $WF cannot read last build');
    expect(loop).toContain('NIGHTLY FAILED: $WF cannot start build');
    expect(loop).toContain('NIGHTLY FAILED: $WF response missing buildId');
    expect(loop).toContain('already in progress - skip');
    expect(loop).toContain('no changes since last successful build');
    expect(loop).not.toMatch(/echo\b[^\n]*\$(AUTH|BUILDS_JSON|TRIGGER_JSON|CODEMAGIC_API_TOKEN)\b/);
  });

  const buildSha = 'a'.repeat(40);
  const buildToken = 'nightly-token-secret';
  const buildCurl = `
curl() {
  method=GET
  url=
  prev=
  for arg in "$@"; do
    if [ "$prev" = "-X" ]; then method=$arg; fi
    case "$arg" in
      https://*|http://*) url=$arg ;;
    esac
    prev=$arg
  done
  case "$url" in
    *api.github.com*)
      printf '%s\\n' '{"sha":"'"$CI_COMMIT_SHA"'"}' ;;
    *api.codemagic.io/builds*)
      if [ "$method" = POST ]; then
        if [ "\${POST_FAIL:-}" = 1 ]; then
          echo "curl: (7) Failed to connect to api.codemagic.io" >&2
          return 7
        fi
        printf '%s\\n' "\${POST_BODY:-}"
        return 0
      fi
      if [ "\${GET_FAIL:-}" = 1 ]; then
        echo "curl: (7) Failed to connect to api.codemagic.io" >&2
        return 7
      fi
      printf '%s\\n' "\${GET_BODY:-}" ;;
    *)
      echo "unexpected curl" >&2
      return 98 ;;
  esac
}
git() { echo "git should not run" >&2; return 97; }
`;
  function buildRun(env: Record<string, string> = {}) {
    return run(buildCurl + nightly, {
      CI_COMMIT_SHA: buildSha,
      CODEMAGIC_API_TOKEN: buildToken,
      CODEMAGIC_APP_ID: 'app-test',
      GET_FAIL: '',
      POST_FAIL: '',
      GET_BODY: '{"builds":[]}',
      POST_BODY: '{"buildId":"build-123"}',
      ...env,
    });
  }
  function expectNoBuildSecrets(result: { stdout: string; stderr: string }) {
    const output = result.stdout + result.stderr;
    expect(output).not.toContain(buildToken);
    expect(output).not.toContain('x-auth-token');
    expect(output).not.toContain('fake-github-token');
    expect(output).not.toContain('fake-gitlab-token');
  }

  it('exits nonzero when the start POST cannot connect', () => {
    const result = buildRun({ POST_FAIL: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-ios cannot start build');
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-android cannot start build');
    expect(result.stderr).toContain('curl: (7) Failed to connect to api.codemagic.io');
    expect(result.stdout).not.toContain('started build');
    expectNoBuildSecrets(result);
  });

  it.each([
    '{}',
    '{"buildId":null}',
    '{"buildId":""}',
    '{"buildId":42}',
  ])('exits nonzero when the start response has no build id (%s)', (body) => {
    const result = buildRun({ POST_BODY: body });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-ios response missing buildId');
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-android response missing buildId');
    expect(result.stdout).not.toContain('started build');
    expectNoBuildSecrets(result);
  });

  it.each([
    [{ GET_FAIL: '1' }, 'cannot list builds'],
    [{ GET_BODY: 'not-json' }, 'cannot parse builds'],
  ])('exits nonzero when listing builds fails (%j)', (env, reason) => {
    const result = buildRun(env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-ios ' + reason);
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-android ' + reason);
    expect(result.stdout).not.toContain('starting build');
    expect(result.stdout).not.toContain('started build');
    expectNoBuildSecrets(result);
  });

  it.each([
    ['building', 'cannot read active builds'],
    ['finished', 'cannot read last build'],
  ])('exits 1 when the iOS %s record cannot be read and still attempts Android', (status, reason) => {
    // Objects pass the workflow filter. A non-object commit fails the later jq.
    const otherSha = 'b'.repeat(40);
    const body = JSON.stringify({
      builds: [
        {
          fileWorkflowId: 'acreledger-ios',
          branch: 'main',
          status,
          startedAt: '2026-10-01T00:00:00.000Z',
          commit: 'not-an-object',
        },
        {
          fileWorkflowId: 'acreledger-android',
          branch: 'main',
          status: 'finished',
          startedAt: '2026-10-01T00:00:00.000Z',
          commit: { hash: otherSha },
        },
      ],
    });
    const result = buildRun({ GET_BODY: body });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-ios ' + reason);
    expect(result.stderr).not.toContain('NIGHTLY FAILED: acreledger-android');
    expect(result.stderr).not.toContain('cannot parse builds');
    expect(result.stdout).toContain(
      'acreledger-android: last successful=' + otherSha + ', main=' + buildSha + ' - starting build',
    );
    expect(result.stdout).toContain('acreledger-android: started build build-123');
    expect(result.stdout).not.toContain('acreledger-ios:');
    expectNoBuildSecrets(result);
  });

  it('attempts Android when the iOS start POST fails and still exits nonzero', () => {
    const recordingCurl = `
curl() {
  method=GET
  url=
  prev=
  data=
  for arg in "$@"; do
    if [ "$prev" = "-X" ]; then method=$arg; fi
    if [ "$prev" = "-d" ]; then data=$arg; fi
    case "$arg" in
      https://*|http://*) url=$arg ;;
    esac
    prev=$arg
  done
  echo "curl-call $method $url $data" >&2
  case "$url" in
    *api.github.com*)
      printf '%s\\n' '{"sha":"'"$CI_COMMIT_SHA"'"}' ;;
    *api.codemagic.io/builds*)
      if [ "$method" = POST ]; then
        case "$data" in
          *acreledger-ios*)
            echo "curl: (7) Failed to connect to api.codemagic.io" >&2
            return 7
            ;;
        esac
        printf '%s\\n' '{"buildId":"build-android"}'
        return 0
      fi
      printf '%s\\n' '{"builds":[]}' ;;
    *)
      echo "unexpected curl" >&2
      return 98 ;;
  esac
}
git() { echo "git should not run" >&2; return 97; }
`;
    const result = run(recordingCurl + nightly, {
      CI_COMMIT_SHA: buildSha,
      CODEMAGIC_API_TOKEN: buildToken,
      CODEMAGIC_APP_ID: 'app-test',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('NIGHTLY FAILED: acreledger-ios cannot start build');
    expect(result.stdout).toContain('acreledger-android: started build build-android');
    expect(result.stderr).toMatch(/curl-call POST \S+ .*acreledger-ios/);
    expect(result.stderr).toMatch(/curl-call POST \S+ .*acreledger-android/);
    expectNoBuildSecrets(result);
  });

  it('prints the build id when Codemagic accepts the start request', () => {
    const result = buildRun();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('acreledger-ios: started build build-123');
    expect(result.stdout).toContain('acreledger-android: started build build-123');
    expect(result.stderr).not.toContain('NIGHTLY FAILED');
    expectNoBuildSecrets(result);
  });

  it.each([
    ['finished', `no changes since last successful build (${buildSha}) - skip`],
    ['building', `build for ${buildSha} already in progress - skip`],
  ])('keeps the %s skip path and does not post', (status, message) => {
    const body = JSON.stringify({
      builds: ['acreledger-ios', 'acreledger-android'].map((workflowId) => ({
        fileWorkflowId: workflowId,
        branch: 'main',
        status,
        startedAt: '2026-10-01T00:00:00.000Z',
        commit: { hash: buildSha },
      })),
    });
    const result = buildRun({ GET_BODY: body, POST_FAIL: '1' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('acreledger-ios: ' + message);
    expect(result.stdout).toContain('acreledger-android: ' + message);
    expect(result.stdout).not.toContain('started build');
    expect(result.stderr).not.toContain('NIGHTLY FAILED');
    expectNoBuildSecrets(result);
  });
});
