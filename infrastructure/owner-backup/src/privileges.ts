import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { childProcessDatabaseEnv } from "./config.js";
import { assertSuccess } from "./command.js";
import { withRetry } from "./retry.js";
import type { CommandRunner } from "./types.js";

export const PRIVILEGES_FILE = "privileges.sql";

const API_EXECUTE_ROLES = new Set(["anon", "authenticated", "public"]);

const PRIVILEGE_HEADER = `-- Object privileges captured with pg_dump --schema-only --no-owner.
-- CREATE statements are omitted so restore can apply this after schema files exist.
SET search_path = '';

`;

/**
 * Query a restored database and compare EXECUTE grants with the source.
 * Used by a human test restore; not executed by the backup worker.
 */
export const FUNCTION_EXECUTE_AUDIT_SQL = `SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
  COALESCE(r.rolname, 'PUBLIC') AS grantee
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) granted
LEFT JOIN pg_catalog.pg_roles r ON r.oid = granted.grantee
WHERE granted.privilege_type = 'EXECUTE'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND COALESCE(r.rolname, 'PUBLIC') IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY 1, 2, 3, 4;`;

export function privilegeDumpSchemas(appSchemas: string[]): string[] {
  const extras = ["auth", "storage", "supabase_migrations"];
  return [...appSchemas, ...extras.filter((schema) => !appSchemas.includes(schema))];
}

export function buildPrivilegeDumpArgs(schemas: string[]): string[] {
  const args = [
    "--schema-only",
    "--no-owner",
    "--no-password",
    ...schemas.flatMap((schema) => ["--schema", schema]),
  ];
  if (args.includes("--no-privileges") || args.includes("--no-acl") || args.includes("-x")) {
    throw new Error("Privilege dump must not suppress grants with --no-privileges, --no-acl, or -x.");
  }
  return args;
}

function readDollarTag(sql: string, index: number): string | null {
  if (sql[index] !== "$") return null;
  const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  return match?.[0] ?? null;
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (char === "$" && sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      i += 1;
      continue;
    }
    if (inSingle) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (char === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (char === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      current += "--";
      i += 2;
      inLineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      current += "/*";
      i += 2;
      inBlockComment = true;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      current += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      current += char;
      i += 1;
      continue;
    }
    const tag = readDollarTag(sql, i);
    if (tag) {
      dollarTag = tag;
      current += tag;
      i += tag.length;
      continue;
    }
    if (char === ";") {
      current += char;
      statements.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  if (current.trim()) statements.push(current);
  return statements;
}

function stripLeadingNoise(statement: string): string {
  let text = statement.replace(/^\s*\\[^\n]*\n?/gm, "");
  while (true) {
    const stripped = text
      .replace(/^\s+/, "")
      .replace(/^--[^\n]*\n?/, "")
      .replace(/^\/\*[\s\S]*?\*\//, "");
    if (stripped === text) return text.trim();
    text = stripped;
  }
}

function isPrivilegeStatement(statement: string): boolean {
  const head = stripLeadingNoise(statement);
  return /^(GRANT|REVOKE)\b/i.test(head) || /^ALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(head);
}

export function extractPrivilegeStatements(sql: string): string {
  const statements = splitSqlStatements(sql)
    .filter((statement) => isPrivilegeStatement(statement))
    .map((statement) => {
      const body = stripLeadingNoise(statement).replace(/\s+$/, "");
      return body.endsWith(";") ? body : `${body};`;
    });
  if (statements.length === 0) {
    throw new Error("Privilege dump produced no GRANT/REVOKE/ALTER DEFAULT PRIVILEGES statements.");
  }
  return `${PRIVILEGE_HEADER}${statements.join("\n\n")}\n`;
}

export function assertPrivilegeArtifact(sql: string): void {
  const hasPrivilege = splitSqlStatements(sql).some((statement) => isPrivilegeStatement(statement));
  if (!hasPrivilege) {
    throw new Error("privileges.sql must contain GRANT or REVOKE statements.");
  }
}

export function listExecuteGrantsToApiRoles(sql: string): Array<{ statement: string; role: string }> {
  const found: Array<{ statement: string; role: string }> = [];
  for (const statement of splitSqlStatements(sql)) {
    const text = stripLeadingNoise(statement);
    if (!/^GRANT\b/i.test(text)) continue;
    if (!/\bON\s+(FUNCTION|PROCEDURE|ROUTINE|ALL\s+FUNCTIONS)\b/i.test(text)) continue;
    const toClause = text.match(
      /\bTO\s+((?:PUBLIC|"[^"]+"|[A-Za-z_][\w]*)(?:\s*,\s*(?:PUBLIC|"[^"]+"|[A-Za-z_][\w]*))*)(?:\s+WITH\s+GRANT\s+OPTION)?\s*;?\s*$/i,
    );
    if (!toClause) continue;
    const roles = toClause[1]
      .split(",")
      .map((role) => role.trim().replace(/^"+|"+$/g, "").toLowerCase())
      .filter(Boolean);
    for (const role of roles) {
      if (API_EXECUTE_ROLES.has(role)) {
        found.push({ statement: text, role });
      }
    }
  }
  return found;
}

export async function exportPrivileges(options: {
  databaseUrl: string;
  databaseDir: string;
  schemas: string[];
  runner: CommandRunner;
}): Promise<string> {
  const dest = path.join(options.databaseDir, PRIVILEGES_FILE);
  const rawFile = path.join(os.tmpdir(), `acreledger-privileges-${randomUUID()}.sql`);
  const args = [...buildPrivilegeDumpArgs(privilegeDumpSchemas(options.schemas)), "-f", rawFile];
  try {
    const result = await withRetry(
      () => options.runner.run("pg_dump", args, { env: childProcessDatabaseEnv(options.databaseUrl) }),
      { attempts: 3, baseMs: 1000 },
    );
    assertSuccess(result, "pg_dump privileges.sql");
    const raw = await fs.readFile(rawFile, "utf8");
    const extracted = extractPrivilegeStatements(raw);
    assertPrivilegeArtifact(extracted);
    await fs.writeFile(dest, extracted, "utf8");
    return dest;
  } finally {
    await fs.unlink(rawFile).catch(() => undefined);
  }
}
