import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Public tenant-registry tables whose rows belong to a farm (not profiles). */
export function farmOwnedTables(registrySource) {
  const tables = new Set();
  const blockRe = /\{[\s\S]*?schema:\s*"([^"]+)"[\s\S]*?table:\s*"([^"]+)"[\s\S]*?ownership:\s*"([^"]+)"/g;
  for (const match of registrySource.matchAll(blockRe)) {
    const [, schema, table, ownership] = match;
    if (schema === 'public' && (ownership === 'root' || ownership === 'direct' || ownership === 'indirect')) {
      tables.add(table);
    }
  }
  return tables;
}

export function loadFarmOwnedTables(registryPath = resolve(root, 'scripts/recovery/tenant-registry.ts')) {
  return farmOwnedTables(readFileSync(registryPath, 'utf8'));
}

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === '\n') line++;
  return line;
}

/**
 * Blank comments and string/template contents so the scanner does not match
 * inside them. Newlines stay put so indexes still map to the original source.
 * Allowlist comments cover the comment line and the next 15 lines.
 */
export function maskSource(source) {
  const allow = new Map();
  let code = '';
  let i = 0;
  let line = 1;

  function grant(kind, atLine) {
    for (let n = atLine; n <= atLine + 15; n++) {
      if (!allow.has(n)) allow.set(n, new Set());
      allow.get(n).add(kind);
    }
  }

  function noteComment(text, atLine) {
    const match = /farm-write-allowlist:\s*(delete|upsert|update-select)\b/.exec(text);
    if (match) grant(match[1], atLine);
  }

  while (i < source.length) {
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      noteComment(source.slice(i, stop), line);
      code += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      const text = source.slice(i, stop);
      noteComment(text, line);
      for (const ch of text) {
        code += ch === '\n' ? '\n' : ' ';
        if (ch === '\n') line++;
      }
      i = stop;
      continue;
    }
    const quote = source[i];
    if (quote === "'" || quote === '"' || quote === '`') {
      code += quote;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') {
          code += '  ';
          i += 2;
          continue;
        }
        if (source[i] === '\n') {
          line++;
          code += '\n';
          i++;
          continue;
        }
        if (quote === '`' && source.startsWith('${', i)) {
          code += '${';
          i += 2;
          let depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            if (source[i] === '\n') line++;
            code += source[i];
            i++;
          }
          continue;
        }
        const ch = source[i];
        code += ch === quote ? quote : ' ';
        i++;
        if (ch === quote) break;
      }
      continue;
    }
    if (source[i] === '\n') line++;
    code += source[i];
    i++;
  }
  return { code, allow };
}

function skipSpace(code, index) {
  let i = index;
  while (i < code.length && /\s/.test(code[i])) i++;
  return i;
}

function readIdent(code, index) {
  const match = /^[A-Za-z_$][\w$]*/.exec(code.slice(index));
  return match ? match[0] : '';
}

function matchParen(code, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function literalTable(arg) {
  const match = /^['"]([A-Za-z_][\w]*)['"]$/.exec(arg.trim());
  return match ? match[1] : null;
}

function skipSpaceBack(code, index) {
  let i = index;
  while (i >= 0 && /\s/.test(code[i])) i--;
  return i;
}

function readIdentBack(code, end) {
  if (end < 0 || !/[\w$]/.test(code[end])) return null;
  let start = end;
  while (start >= 0 && /[\w$]/.test(code[start])) start--;
  const name = code.slice(start + 1, end + 1);
  if (!/^[A-Za-z_$]/.test(name)) return null;
  return { name, start: start + 1 };
}

/** `const query = supabase.from(...)` → `query`, when the from() is the end of the RHS. */
function assignedFromName(code, fromIndex) {
  let i = skipSpaceBack(code, fromIndex - 1);
  let ident = readIdentBack(code, i);
  if (!ident) return null;
  i = skipSpaceBack(code, ident.start - 1);
  while (code[i] === '.') {
    ident = readIdentBack(code, skipSpaceBack(code, i - 1));
    if (!ident) return null;
    i = skipSpaceBack(code, ident.start - 1);
  }
  if (code[i] !== '=') return null;
  ident = readIdentBack(code, skipSpaceBack(code, i - 1));
  return ident ? ident.name : null;
}

/** Walk each `.from(...)` call and the chained methods that follow it. */
export function fromChains(code) {
  const chains = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== '.') continue;
    if (readIdent(code, i + 1) !== 'from') continue;
    const paren = i + 5;
    if (code[paren] !== '(') continue;
    const close = matchParen(code, paren);
    if (close < 0) continue;
    const arg = code.slice(paren + 1, close);
    const methods = [];
    let cursor = close + 1;
    while (true) {
      const dot = skipSpace(code, cursor);
      if (code[dot] !== '.') break;
      const name = readIdent(code, dot + 1);
      const open = dot + 1 + name.length;
      if (!name || code[open] !== '(') break;
      const end = matchParen(code, open);
      if (end < 0) break;
      methods.push({ name, index: dot });
      cursor = end + 1;
    }
    chains.push({ fromIndex: i, argStart: paren + 1, argEnd: close, methods });
    i = close;
  }
  return chains;
}

function allowed(allow, index, source, kind) {
  const kinds = allow.get(lineAt(source, index));
  return kinds ? kinds.has(kind) : false;
}

/**
 * Supabase `.delete()` on a farm-owned table, or on a non-literal `.from()`,
 * inside src/. Non-farm literals (the profiles permission probe) are ignored.
 */
function chainTable(source, chain) {
  return literalTable(source.slice(chain.argStart, chain.argEnd));
}

function deleteReason(table) {
  return table
    ? `.delete() on farm-owned table ${table}`
    : '.delete() on a non-literal .from() (could be a farm-owned table)';
}

function isFarmDelete(table, tables) {
  return !table || tables.has(table);
}

export function findDeleteViolations(source, file, tables) {
  const { code, allow } = maskSource(source);
  const violations = [];
  for (const chain of fromChains(code)) {
    const table = chainTable(source, chain);
    const hit = chain.methods.find((method) => method.name === 'delete');
    if (hit) {
      if (!allowed(allow, hit.index, source, 'delete') && isFarmDelete(table, tables)) {
        violations.push({ file, line: lineAt(source, hit.index), rule: 'delete', message: deleteReason(table) });
      }
      continue;
    }
    const name = assignedFromName(code, chain.fromIndex);
    if (!name || !isFarmDelete(table, tables)) continue;
    const callRe = new RegExp(`\\b${name}\\s*\\.\\s*delete\\s*\\(`, 'g');
    for (const match of code.matchAll(callRe)) {
      if (allowed(allow, match.index, source, 'delete')) continue;
      violations.push({
        file,
        line: lineAt(source, match.index),
        rule: 'delete',
        message: `${deleteReason(table)} (via ${name})`,
      });
    }
  }
  return violations;
}

const UPSERT_TABLES = new Set(['fsa_tract_imports', 'field_clu_assignments']);

function upsertReason(table) {
  return table
    ? `.upsert() on ${table} (only fsa_tract_imports and field_clu_assignments may upsert)`
    : '.upsert() on a non-literal .from() (only fsa_tract_imports and field_clu_assignments may upsert)';
}

export function findUpsertViolations(source, file) {
  const { code, allow } = maskSource(source);
  const violations = [];
  for (const chain of fromChains(code)) {
    const table = chainTable(source, chain);
    const permitted = table !== null && UPSERT_TABLES.has(table);
    const hit = chain.methods.find((method) => method.name === 'upsert');
    if (hit) {
      if (!permitted && !allowed(allow, hit.index, source, 'upsert')) {
        violations.push({ file, line: lineAt(source, hit.index), rule: 'upsert', message: upsertReason(table) });
      }
      continue;
    }
    if (permitted) continue;
    const name = assignedFromName(code, chain.fromIndex);
    if (!name) continue;
    const callRe = new RegExp(`\\b${name}\\s*\\.\\s*upsert\\s*\\(`, 'g');
    for (const match of code.matchAll(callRe)) {
      if (allowed(allow, match.index, source, 'upsert')) continue;
      violations.push({
        file,
        line: lineAt(source, match.index),
        rule: 'upsert',
        message: `${upsertReason(table)} (via ${name})`,
      });
    }
  }
  return violations;
}

export function findUpdateSelectViolations(source, file) {
  const { code, allow } = maskSource(source);
  const violations = [];
  for (const chain of fromChains(code)) {
    const updateAt = chain.methods.findIndex((method) => method.name === 'update');
    if (updateAt < 0) continue;
    const select = chain.methods.slice(updateAt + 1).find((method) => method.name === 'select');
    if (select) {
      if (!allowed(allow, select.index, source, 'update-select')) {
        violations.push({
          file,
          line: lineAt(source, select.index),
          rule: 'update-select',
          message: '.select() chained after .update() (deleted_at SELECT policy hides the row and the client rolls back)',
        });
      }
      continue;
    }
    const name = assignedFromName(code, chain.fromIndex);
    if (!name) continue;
    const callRe = new RegExp(`\\b${name}\\s*\\.\\s*select\\s*\\(`, 'g');
    for (const match of code.matchAll(callRe)) {
      if (allowed(allow, match.index, source, 'update-select')) continue;
      violations.push({
        file,
        line: lineAt(source, match.index),
        rule: 'update-select',
        message: `.select() after .update() via ${name} (deleted_at SELECT policy hides the row and the client rolls back)`,
      });
    }
  }
  return violations;
}

export function scanDeleteText(source, file, tables) {
  return findDeleteViolations(source, file, tables);
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(path, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(path);
    }
  }
}

export function scanSrcWrites(srcDir = resolve(root, 'src'), tables = loadFarmOwnedTables()) {
  const files = [];
  walk(srcDir, files);
  const violations = [];
  for (const path of files) {
    const source = readFileSync(path, 'utf8');
    const file = relative(root, path);
    violations.push(...findDeleteViolations(source, file, tables));
    violations.push(...findUpsertViolations(source, file));
    violations.push(...findUpdateSelectViolations(source, file));
  }
  return violations;
}

export function scanSrcDeletes(srcDir = resolve(root, 'src'), tables = loadFarmOwnedTables()) {
  return scanSrcWrites(srcDir, tables).filter((hit) => hit.rule === 'delete');
}
