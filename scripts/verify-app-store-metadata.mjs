import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadataPath = resolve(root, 'docs/app-store/metadata.en-US.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const problems = [];

const limits = {
  name: 30,
  subtitle: 30,
  promotionalText: 170,
  description: 4000,
};

for (const [field, max] of Object.entries(limits)) {
  const value = metadata[field];
  if (typeof value !== 'string' || value.length === 0) {
    problems.push(`${field} must be a non-empty string`);
  } else if ([...value].length > max) {
    problems.push(`${field} is ${[...value].length} characters; limit is ${max}`);
  }
}

const keywordBytes = Buffer.byteLength(metadata.keywords ?? '', 'utf8');
if (keywordBytes === 0 || keywordBytes > 100) {
  problems.push(`keywords use ${keywordBytes} UTF-8 bytes; limit is 100`);
}

for (const field of ['supportUrl', 'marketingUrl', 'privacyPolicyUrl']) {
  try {
    const url = new URL(metadata[field]);
    if (url.protocol !== 'https:') problems.push(`${field} must use HTTPS`);
  } catch {
    problems.push(`${field} must be a valid URL`);
  }
}

if (metadata.version !== '3.6.0') {
  problems.push('version must match the iOS marketing version produced from package.json');
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`App Store metadata verified (${keywordBytes}/100 keyword bytes).`);
}
