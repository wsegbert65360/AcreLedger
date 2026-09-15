import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(projectRoot, 'src');
const sourceExtensions = new Set(['.ts', '.tsx']);
const assetExtensions = 'png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf';
const importPattern = new RegExp(
  String.raw`(?:from\s*|import\s*)['"]([^'"]+\.(?:${assetExtensions}))['"]`,
  'gi',
);

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const entry = resolve(directory, name);
    return statSync(entry).isDirectory() ? walk(entry) : [entry];
  });
}

function toRepoPath(filePath) {
  return relative(projectRoot, filePath).split(sep).join('/');
}

let trackedFiles = null;
try {
  trackedFiles = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: projectRoot })
      .toString('utf8')
      .split('\0')
      .filter(Boolean),
  );
} catch {
  console.warn('Git metadata is unavailable; checking imported asset existence only.');
}

const problems = [];

for (const sourceFile of walk(sourceRoot)) {
  const extension = sourceFile.slice(sourceFile.lastIndexOf('.'));
  if (!sourceExtensions.has(extension)) continue;

  const source = readFileSync(sourceFile, 'utf8');
  importPattern.lastIndex = 0;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (
      !specifier.startsWith('@/') &&
      !specifier.startsWith('./') &&
      !specifier.startsWith('../')
    ) {
      continue;
    }

    const assetPath = specifier.startsWith('@/')
      ? resolve(sourceRoot, specifier.slice(2))
      : resolve(dirname(sourceFile), specifier);
    const repoPath = toRepoPath(assetPath);

    if (!existsSync(assetPath)) {
      problems.push(`${toRepoPath(sourceFile)} imports missing asset ${repoPath}`);
    } else if (trackedFiles && !trackedFiles.has(repoPath)) {
      problems.push(`${toRepoPath(sourceFile)} imports untracked asset ${repoPath}`);
    }
  }
}

if (problems.length > 0) {
  console.error('Imported production assets must exist and be tracked by Git:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('All imported production assets exist and are tracked.');
}
