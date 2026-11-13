// New public farm-owned tables (a farm_id column) created after this migration
// must enable RLS, grant no DELETE to client roles, grant nothing to anon, and
// keep deleted_at IS NULL on any client SELECT policy. Existing migrations are
// not re-checked. service_role grants are out of scope: that role bypasses RLS.
export const FARM_TABLE_GUARD_AFTER = '20261110190000';

const CLIENT_ROLES = new Set(['anon', 'authenticated', 'public']);

export function stripSql(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function matchParen(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function createdTables(sql) {
  const tables = [];
  const re = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:ONLY\s+)?(?:([a-z_][\w]*)\.)?([a-z_][\w]*)\s*\(/gi;
  for (const match of sql.matchAll(re)) {
    const schema = (match[1] || 'public').toLowerCase();
    const name = match[2].toLowerCase();
    const open = match.index + match[0].length - 1;
    const close = matchParen(sql, open);
    if (close < 0) continue;
    const body = sql.slice(open + 1, close);
    tables.push({
      schema,
      name,
      farmOwned: schema === 'public' && /\bfarm_id\b/i.test(body),
    });
  }
  return tables;
}

function timestamp(name) {
  const match = /^(\d{14})_/.exec(name);
  return match ? match[1] : '';
}

function expandPrivileges(priv) {
  if (/\bALL(?:\s+PRIVILEGES)?\b/i.test(priv)) return ['all'];
  return priv.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
}

function grantStatements(sql, table) {
  const re = /\b(?:GRANT|REVOKE)\b[\s\S]*?;/gi;
  const on = new RegExp(`\\bON\\s+(?:TABLE\\s+)?(?:ONLY\\s+)?(?:public\\.)?${table}\\b`, 'i');
  return [...sql.matchAll(re)].map((match) => match[0]).filter((stmt) => on.test(stmt));
}

function netClientGrants(sql, table) {
  const grants = {
    anon: new Set(),
    authenticated: new Set(),
    public: new Set(),
  };
  for (const stmt of grantStatements(sql, table)) {
    const kind = /^\s*(GRANT|REVOKE)/i.exec(stmt)?.[1].toUpperCase();
    const privText = /^(?:GRANT|REVOKE)\s+([\s\S]+?)\s+ON\b/i.exec(stmt)?.[1] ?? '';
    const roleText = /\b(?:TO|FROM)\s+([\s\S]+?);/i.exec(stmt)?.[1] ?? '';
    const privs = expandPrivileges(privText);
    const roles = roleText.split(',').map((role) => role.trim().toLowerCase().replace(/"/g, ''));
    for (const role of roles) {
      if (!CLIENT_ROLES.has(role)) continue;
      if (kind === 'GRANT') {
        for (const priv of privs) grants[role].add(priv);
      } else if (privs.includes('all')) {
        grants[role].clear();
      } else {
        for (const priv of privs) grants[role].delete(priv);
      }
    }
  }
  return grants;
}

function hasRls(sql, table) {
  const re = new RegExp(
    `ALTER\\s+TABLE(?:\\s+IF\\s+EXISTS)?(?:\\s+ONLY)?\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  return re.test(sql);
}

function policies(sql, table) {
  const re = new RegExp(
    `CREATE\\s+POLICY\\s+(?:"[^"]+"|[a-z_][\\w]*)\\s+ON\\s+(?:public\\.)?${table}\\b([\\s\\S]*?);`,
    'gi',
  );
  return [...sql.matchAll(re)].map((match) => match[1]);
}

function policyKind(body) {
  if (/\bFOR\s+ALL\b/i.test(body)) return 'select';
  if (/\bFOR\s+SELECT\b/i.test(body)) return 'select';
  if (/\bFOR\s+(?:INSERT|UPDATE|DELETE)\b/i.test(body)) return null;
  return 'select';
}

function hasDeletedAtNull(body) {
  return /deleted_at\s+IS\s+NULL/i.test(body);
}

function clientCanSelect(grants) {
  for (const role of ['authenticated', 'public']) {
    if (grants[role].has('all') || grants[role].has('select')) return true;
  }
  return false;
}

function clientHasDelete(grants) {
  for (const role of CLIENT_ROLES) {
    if (grants[role].has('all') || grants[role].has('delete')) return true;
  }
  return false;
}

/**
 * @param {{ name: string, sql: string }[]} files
 * @param {string} [cutoff]
 * @returns {string[]}
 */
export function checkNewFarmMigrations(files, cutoff = FARM_TABLE_GUARD_AFTER) {
  const fresh = files.filter((file) => timestamp(file.name) > cutoff);
  if (fresh.length === 0) return [];
  const combined = fresh.map((file) => stripSql(file.sql)).join('\n');
  const problems = [];
  const seen = new Set();
  for (const file of fresh) {
    for (const table of createdTables(stripSql(file.sql))) {
      if (!table.farmOwned || seen.has(table.name)) continue;
      seen.add(table.name);
      const where = `${file.name} public.${table.name}`;
      if (!hasRls(combined, table.name)) {
        problems.push(`${where}: ENABLE ROW LEVEL SECURITY is required`);
      }
      const grants = netClientGrants(combined, table.name);
      if (grants.anon.size > 0) {
        problems.push(`${where}: no anon grant (found ${[...grants.anon].join(', ')})`);
      }
      if (clientHasDelete(grants)) {
        problems.push(`${where}: no DELETE grant to anon, authenticated, or PUBLIC`);
      }
      const selectPolicies = policies(combined, table.name).filter((body) => policyKind(body) === 'select');
      const readable = clientCanSelect(grants);
      if (readable && selectPolicies.length === 0) {
        problems.push(`${where}: a client SELECT needs a policy with deleted_at IS NULL`);
      }
      for (const body of selectPolicies) {
        if (!hasDeletedAtNull(body)) {
          problems.push(`${where}: SELECT policy must contain deleted_at IS NULL`);
        }
      }
    }
  }
  return problems;
}
