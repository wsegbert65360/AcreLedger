import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const viteBin = resolve(projectRoot, 'node_modules/vite/bin/vite.js');

const SENTINEL = 'ZZSENTINELVCKEY0000';
const DUMMY_PROXY_URL = 'https://example.invalid';

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const entry = resolve(directory, name);
    return statSync(entry).isDirectory() ? walk(entry) : [entry];
  });
}

function toRepoPath(filePath) {
  return relative(projectRoot, filePath).split(sep).join('/');
}

function scanDist(label) {
  if (!existsSync(distRoot)) {
    console.error(`${label}: dist is missing after the Vite build.`);
    process.exit(1);
  }

  const hits = [];
  for (const file of walk(distRoot)) {
    if (readFileSync(file).includes(SENTINEL)) hits.push(toRepoPath(file));
  }

  if (hits.length > 0) {
    console.error(`${label}: sentinel ${SENTINEL} found in the bundle:`);
    for (const hit of hits) console.error(`- ${hit}`);
    process.exit(1);
  }

  console.log(`${label}: no sentinel in dist.`);
}

function runViteBuild(label, extraEnv) {
  console.log(`${label}: building...`);
  execFileSync(process.execPath, [viteBin, 'build', ...extraEnv.args], {
    cwd: projectRoot,
    env: extraEnv.env,
    stdio: 'inherit',
  });
  scanDist(label);
}

if (!existsSync(viteBin)) {
  console.error('vite is not installed (node_modules/vite/bin/vite.js missing).');
  process.exit(1);
}

const sentinelEnv = {
  ...process.env,
  VITE_VISUALCROSSING_KEY: SENTINEL,
};

runViteBuild('web', { args: [], env: sentinelEnv });
runViteBuild('capacitor', {
  args: ['--mode', 'capacitor'],
  env: {
    ...sentinelEnv,
    VITE_WEATHER_PROXY_URL: DUMMY_PROXY_URL,
    // Capacitor mode (PR #57) refuses a missing Supabase URL/anon key.
    // Dummy values only — this scan is for the Visual Crossing sentinel.
    VITE_SUPABASE_URL: DUMMY_PROXY_URL,
    VITE_SUPABASE_ANON_KEY: 'bundle-scan-anon-key',
  },
});

console.log('Visual Crossing sentinel is absent from web and capacitor bundles.');
