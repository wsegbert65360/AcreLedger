import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately scoped to the two operating guides, using ATX headings and inline
// Markdown links. This is not a general Markdown parser or an external URL check.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guides = ['AGENTS.md', 'BLUEPRINT.md'];
const start = '<!-- contents:start -->';
const end = '<!-- contents:end -->';
const write = process.argv.includes('--write');
const problems = [];

function headings(text) {
  const used = new Set();
  let fence = null;
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const match = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (!match) continue;
    const title = match[2];
    const base = title.toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, '').replace(/ /g, '-');
    let slug = base;
    for (let suffix = 1; used.has(slug); suffix++) slug = `${base}-${suffix}`;
    used.add(slug);
    result.push({ depth: match[1].length, title, slug });
  }
  return result;
}

function contents(text, file) {
  const depth = file === 'AGENTS.md' ? 2 : 3;
  return headings(text)
    .filter((h) => h.depth >= 2 && h.depth <= depth && !['Contents', 'External Resources'].includes(h.title))
    .map((h) => `${'  '.repeat(h.depth - 2)}- [${h.title}](#${h.slug})`)
    .join('\n');
}

for (const file of guides) {
  const path = resolve(root, file);
  let text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const begin = text.indexOf(start);
  const finish = text.indexOf(end);
  if (begin < 0 || finish < begin || text.indexOf(start, begin + start.length) >= 0 || text.indexOf(end, finish + end.length) >= 0) {
    problems.push(`${file}: expected one contents marker pair`);
    continue;
  }
  const expected = `${start}\n${contents(text, file)}\n${end}`;
  if (text.slice(begin, finish + end.length) !== expected) {
    if (write) {
      text = text.slice(0, begin) + expected + text.slice(finish + end.length);
      writeFileSync(path, text);
    } else problems.push(`${file}: stale contents; run npm run docs:toc`);
  }

  // Preserve newlines for useful error locations while ignoring code examples.
  const prose = text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, (block) => block.replace(/[^\n]/g, ' '));
  for (const match of prose.matchAll(/\[[^\]\n]+\]\((?:<([^>]+)>|([^\s)]+))\)/g)) {
    const href = match[1] ?? match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    const line = prose.slice(0, match.index).split('\n').length;
    let destination;
    try { destination = decodeURIComponent(href); }
    catch { problems.push(`${file}:${line}: invalid URL encoding in ${href}`); continue; }
    const [target, fragment] = destination.split('#', 2);
    const targetPath = target ? resolve(dirname(path), target) : path;
    if (!existsSync(targetPath)) {
      problems.push(`${file}:${line}: missing file ${href}`);
    } else if (fragment && targetPath.endsWith('.md')) {
      const targetText = targetPath === path ? text : readFileSync(targetPath, 'utf8');
      if (!headings(targetText).some((h) => h.slug === fragment)) {
        problems.push(`${file}:${line}: missing heading ${href}`);
      }
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Documentation ${write ? 'contents updated and links checked' : 'contents and links verified'}: ${guides.join(', ')}`);
}
