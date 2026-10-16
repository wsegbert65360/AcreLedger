import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(resolve(root, 'codemagic.yaml'), 'utf8');
const nightly = readFileSync(resolve(root, 'scripts/ci/codemagic-nightly.sh'), 'utf8');
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/sh.exe' : '/bin/sh';

// Implements the jq invocations in scripts/ci/codemagic-nightly.sh so buildRun
// tests do not need a real jq binary (missing on Vercel images and Windows Git sh).
// Each program is matched in full. Any other filter exits nonzero.
const jqStubSource = String.raw`
(async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString('utf8');

  function fail(code, message) {
    if (message) process.stderr.write(message + '\n');
    process.exit(code);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    fail(4, 'parse error');
  }

  let exitOnFalse = false;
  let rawOut = false;
  const vars = Object.create(null);
  const positional = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--arg') {
      vars[argv[++i]] = argv[++i];
      continue;
    }
    if (a.charAt(0) === '-' && a !== '-') {
      for (const ch of a.slice(1)) {
        if (ch === 'e') exitOnFalse = true;
        else if (ch === 'r') rawOut = true;
      }
      continue;
    }
    positional.push(a);
  }
  const filter = positional[0] || '';

  function emit(value) {
    if (rawOut && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      process.stdout.write(String(value) + '\n');
    } else {
      process.stdout.write(JSON.stringify(value) + '\n');
    }
  }

  function done(value, noOutput) {
    // jq -e: exit 4 when nothing was produced, 1 when the last value is null or false.
    if (noOutput) process.exit(exitOnFalse ? 4 : 0);
    if (exitOnFalse && (value === null || value === false)) {
      emit(value);
      process.exit(1);
    }
    emit(value);
    process.exit(0);
  }

  function iterate(value) {
    if (Array.isArray(value)) return value;
    if (value !== null && typeof value === 'object') return Object.values(value);
    const kind = value === null ? 'null' : typeof value;
    fail(5, 'Cannot iterate over ' + kind);
  }

  function asBuilds(input) {
    return iterate(field(input, 'builds'));
  }

  function field(obj, key) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      fail(5, 'Cannot index ' + typeof obj + ' with string "' + key + '"');
    }
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : null;
  }

  function commitHash(build) {
    return field(field(build, 'commit'), 'hash');
  }

  // jq type order: null < false < true < numbers < strings < arrays < objects.
  function typeRank(value) {
    if (value === null) return 0;
    if (value === false) return 1;
    if (value === true) return 2;
    if (typeof value === 'number') return 3;
    if (typeof value === 'string') return 4;
    if (Array.isArray(value)) return 5;
    if (typeof value === 'object') return 6;
    return 7;
  }

  function compareCodePoints(a, b) {
    const aa = Array.from(a);
    const bb = Array.from(b);
    const n = aa.length < bb.length ? aa.length : bb.length;
    for (let i = 0; i < n; i++) {
      const ca = aa[i].codePointAt(0);
      const cb = bb[i].codePointAt(0);
      if (ca < cb) return -1;
      if (ca > cb) return 1;
    }
    if (aa.length < bb.length) return -1;
    if (aa.length > bb.length) return 1;
    return 0;
  }

  function jqCompare(a, b) {
    const ra = typeRank(a);
    const rb = typeRank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra <= 2) return 0;
    if (ra === 3) {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
    if (ra === 4) return compareCodePoints(a, b);
    if (ra === 5) {
      const n = a.length < b.length ? a.length : b.length;
      for (let i = 0; i < n; i++) {
        const c = jqCompare(a[i], b[i]);
        if (c !== 0) return c;
      }
      if (a.length < b.length) return -1;
      if (a.length > b.length) return 1;
      return 0;
    }
    const ka = Object.keys(a).sort(compareCodePoints);
    const kb = Object.keys(b).sort(compareCodePoints);
    const keys = jqCompare(ka, kb);
    if (keys !== 0) return keys;
    for (let i = 0; i < ka.length; i++) {
      const c = jqCompare(a[ka[i]], b[ka[i]]);
      if (c !== 0) return c;
    }
    return 0;
  }

  const filterSha = '.sha | select(type == "string" and test("^[0-9a-f]{40}$"))';
  const filterBuilds = '{builds: [.builds[] | select(.fileWorkflowId==$wf and .branch=="main")]}';
  const filterActive = '[.builds[] | select(.status|IN("queued","preparing","fetching","building","publishing","testing")) | select(.commit.hash==$sha)] | length';
  const filterLast = '[.builds[] | select(.status=="finished")] | sort_by(.startedAt) | last | .commit.hash // ""';
  const filterBuildId = '.buildId | select(type == "string" and length > 0)';

  if (filter === filterSha) {
    const sha = field(data, 'sha');
    if (typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha)) done(sha);
    else done(null, true);
  } else if (filter === filterBuilds) {
    const wf = vars.wf;
    const builds = asBuilds(data).filter((b) => field(b, 'fileWorkflowId') === wf && field(b, 'branch') === 'main');
    done({ builds: builds });
  } else if (filter === filterActive) {
    const sha = vars.sha;
    const active = new Set(['queued', 'preparing', 'fetching', 'building', 'publishing', 'testing']);
    let count = 0;
    for (const b of asBuilds(data)) {
      if (!active.has(field(b, 'status'))) continue;
      if (commitHash(b) === sha) count++;
    }
    done(count);
  } else if (filter === filterLast) {
    const finished = asBuilds(data).filter((b) => field(b, 'status') === 'finished');
    finished.sort((a, b) => jqCompare(field(a, 'startedAt'), field(b, 'startedAt')));
    if (finished.length === 0) done('');
    const hash = commitHash(finished[finished.length - 1]);
    done(hash === null || hash === false ? '' : hash);
  } else if (filter === filterBuildId) {
    const id = field(data, 'buildId');
    if (typeof id === 'string' && id.length > 0) done(id);
    else done(null, true);
  } else {
    fail(3, 'unsupported jq filter');
  }
})().catch((err) => {
  process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
  process.exit(5);
});
`;

function run(source: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'codemagic-test-'));
  try {
    const testDir = dir.split('\\').join('/');
    writeFileSync(resolve(dir, 'jq-stub.js'), jqStubSource);
    return spawnSync(shell, ['-c', source], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CODEMAGIC_API_TOKEN: 'test-only',
        CI_COMMIT_SHA: 'lab',
        GITHUB_SYNC_TOKEN: 'fake-github-token',
        GITLAB_SYNC_TOKEN: 'fake-gitlab-token',
        TEST_DIR: testDir,
        NODE_BIN: process.execPath.split('\\').join('/'),
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
jq() {
  "$NODE_BIN" "$TEST_DIR/jq-stub.js" "$@"
}
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
jq() {
  "$NODE_BIN" "$TEST_DIR/jq-stub.js" "$@"
}
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

  function nightlyFilters(): string[] {
    const filters: string[] = [];
    const re = /\bjq\b[^\n]*?'([^']*)'/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(nightly))) filters.push(match[1]);
    return filters;
  }

  function jqRun(argsPrefix: string, filter: string, input: string) {
    const prefix = argsPrefix ? argsPrefix + ' ' : '';
    return run(
      'printf \'%s\' "$JQ_INPUT" | "$NODE_BIN" "$TEST_DIR/jq-stub.js" ' + prefix + '"$JQ_FILTER"',
      { JQ_INPUT: input, JQ_FILTER: filter },
    );
  }

  it('runs the nightly filters and rejects any other expression', () => {
    const filters = nightlyFilters();
    expect(filters).toEqual([
      '.sha | select(type == "string" and test("^[0-9a-f]{40}$"))',
      '{builds: [.builds[] | select(.fileWorkflowId==$wf and .branch=="main")]}',
      '[.builds[] | select(.status|IN("queued","preparing","fetching","building","publishing","testing")) | select(.commit.hash==$sha)] | length',
      '[.builds[] | select(.status=="finished")] | sort_by(.startedAt) | last | .commit.hash // ""',
      '.buildId | select(type == "string" and length > 0)',
    ]);
    const sha = 'ab'.repeat(20);
    const accepted = [
      ['-er', filters[0], JSON.stringify({ sha }), sha + '\n'],
      ['--arg wf acreledger-ios', filters[1], '{"builds":[]}', '{"builds":[]}\n'],
      ['-r --arg sha ' + sha, filters[2], '{"builds":[]}', '0\n'],
      ['-r', filters[3], '{"builds":[]}', '\n'],
      ['-er', filters[4], '{"buildId":"build-123"}', 'build-123\n'],
    ] as const;
    for (const [prefix, filter, input, stdout] of accepted) {
      const result = jqRun(prefix, filter, input);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(stdout);
    }
    const changed = [
      filters[0] + ' | .',
      filters[1].replace(' and .branch=="main"', ''),
      filters[2].replace('"testing"', '"cancelled"'),
      filters[3].replace('sort_by(.startedAt) | ', ''),
      '.buildId',
    ];
    for (const filter of changed) {
      const result = jqRun('-er --arg wf acreledger-ios --arg sha ' + sha, filter, JSON.stringify({ sha, buildId: 'build-123', builds: [] }));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('unsupported jq filter');
      expect(result.stdout).toBe('');
    }
  });

  it('exits 4 from jq -e when select produces nothing', () => {
    const filters = nightlyFilters();
    for (const [filter, input] of [
      [filters[0], '{"sha":null}'],
      [filters[0], '{"sha":"ABC"}'],
      [filters[4], '{}'],
      [filters[4], '{"buildId":null}'],
      [filters[4], '{"buildId":""}'],
      [filters[4], '{"buildId":false}'],
      [filters[4], '{"buildId":42}'],
    ] as const) {
      const result = jqRun('-er', filter, input);
      expect(result.status).toBe(4);
      expect(result.stdout).toBe('');
    }
    const emptyLast = jqRun('-er', filters[3], '{"builds":[]}');
    expect(emptyLast.status).toBe(0);
    expect(emptyLast.stdout).toBe('\n');
    const falseHash = jqRun('-er', filters[3], JSON.stringify({
      builds: [{ status: 'finished', startedAt: 't', commit: { hash: false } }],
    }));
    expect(falseHash.status).toBe(0);
    expect(falseHash.stdout).toBe('\n');
    const zeroActive = jqRun('-er --arg sha missing', filters[2], '{"builds":[]}');
    expect(zeroActive.status).toBe(0);
    expect(zeroActive.stdout).toBe('0\n');
  });

  it.each([
    [null, false],
    [false, true],
    [true, 0],
    [-1, 2],
    [0, ''],
    [1, '2026-10-02T00:00:00.000Z'],
    [null, '2026-10-02T00:00:00.000Z'],
    ['', 'a'],
    ['a', 'b'],
    ['\uFFFF', '\u{1F600}'],
    ['z', ['a']],
    [[1], [2]],
    [[1], [1, 2]],
    [['z'], { a: 1 }],
    [{ a: 1 }, { a: 2 }],
    [{ a: 1 }, { a: 1, b: 1 }],
    [{ a: 9 }, { b: 0 }],
  ])('sort_by(.startedAt) orders %j before %j', (lower, higher) => {
    const input = JSON.stringify({
      builds: [
        { status: 'finished', startedAt: higher, commit: { hash: 'higher' } },
        { status: 'finished', startedAt: null, commit: { hash: 'ignored-null' } },
        { status: 'building', startedAt: { zz: 1 }, commit: { hash: 'ignored-active' } },
        { status: 'finished', startedAt: lower, commit: { hash: 'lower' } },
      ],
    });
    const result = jqRun('-r', nightlyFilters()[3], input);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('higher\n');
  });

  it('keeps input order when startedAt values compare equal', () => {
    const result = jqRun('-r', nightlyFilters()[3], JSON.stringify({
      builds: [
        { status: 'finished', startedAt: null, commit: { hash: 'first' } },
        { status: 'finished', startedAt: null, commit: { hash: 'second' } },
      ],
    }));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('second\n');
  });

  it('iterates object values of .builds[]', () => {
    const filters = nightlyFilters();
    const filtered = jqRun('--arg wf acreledger-ios', filters[1], JSON.stringify({
      builds: {
        z: { fileWorkflowId: 'acreledger-ios', branch: 'main', mark: 'z' },
        a: { fileWorkflowId: 'acreledger-ios', branch: 'side', mark: 'a' },
        m: { fileWorkflowId: 'acreledger-ios', branch: 'main', mark: 'm' },
      },
    }));
    expect(filtered.status).toBe(0);
    expect(JSON.parse(filtered.stdout)).toEqual({
      builds: [
        { fileWorkflowId: 'acreledger-ios', branch: 'main', mark: 'z' },
        { fileWorkflowId: 'acreledger-ios', branch: 'main', mark: 'm' },
      ],
    });
    const active = jqRun('-r --arg sha abc', filters[2], JSON.stringify({
      builds: {
        only: { status: 'publishing', commit: { hash: 'abc' } },
        other: { status: 'finished', commit: { hash: 'abc' } },
      },
    }));
    expect(active.status).toBe(0);
    expect(active.stdout).toBe('1\n');
    const rejected = jqRun('--arg wf acreledger-ios', filters[1], '{"builds":"nope"}');
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('Cannot iterate over string');
  });
});
