import { describe, expect, it } from "vitest";
import {
  assertPrivilegeArtifact,
  extractPrivilegeStatements,
  FUNCTION_EXECUTE_AUDIT_SQL,
  listExecuteGrantsToApiRoles,
} from "../src/privileges.js";

const FIXTURE_DUMP = `--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SELECT pg_catalog.set_config('search_path', '', false);

CREATE TABLE public.farms (
    id uuid NOT NULL
);

CREATE FUNCTION public.internal_coords(p_farm uuid) RETURNS jsonb
    LANGUAGE sql
    AS $$
    -- GRANT EXECUTE ON FUNCTION public.internal_coords(uuid) TO anon;
    SELECT '{}'::jsonb;
$$;

--
-- Name: TABLE farms; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,
    INSERT,
    UPDATE ON TABLE public.farms TO authenticated;

GRANT ALL ON TABLE public.farms TO service_role;

REVOKE ALL ON TABLE public.farms FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.internal_coords(p_farm uuid) TO anon;

GRANT ALL ON FUNCTION public.ok_rpc(p_farm uuid) TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT SELECT ON TABLES TO authenticated;
`;

describe("privilege statement extract", () => {
  it("keeps multi-line GRANT/REVOKE and ALTER DEFAULT PRIVILEGES and drops CREATE", () => {
    const sql = extractPrivilegeStatements(FIXTURE_DUMP);
    expect(sql).toContain("GRANT SELECT,\n    INSERT,\n    UPDATE ON TABLE public.farms TO authenticated;");
    expect(sql).toContain("REVOKE ALL ON TABLE public.farms FROM PUBLIC;");
    expect(sql).toContain("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\nGRANT SELECT ON TABLES TO authenticated;");
    expect(sql).not.toContain("CREATE TABLE");
    expect(sql).not.toContain("CREATE FUNCTION");
    expect(sql).not.toMatch(/SELECT '\{\}'::jsonb/);
    assertPrivilegeArtifact(sql);
  });

  it("does not treat GRANT text inside a function body as a privilege statement", () => {
    const sql = extractPrivilegeStatements(FIXTURE_DUMP);
    const bodyGrantMentions = sql.match(/-- GRANT EXECUTE ON FUNCTION public.internal_coords/g) ?? [];
    expect(bodyGrantMentions).toHaveLength(0);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.internal_coords(p_farm uuid) TO anon;");
  });

  it("lists EXECUTE grants to anon, authenticated, or PUBLIC for restore review", () => {
    const sql = extractPrivilegeStatements(FIXTURE_DUMP);
    const grants = listExecuteGrantsToApiRoles(sql);
    expect(grants.map((row) => `${row.role}:${row.statement.split("\n")[0]}`)).toEqual([
      "anon:GRANT EXECUTE ON FUNCTION public.internal_coords(p_farm uuid) TO anon;",
      "authenticated:GRANT ALL ON FUNCTION public.ok_rpc(p_farm uuid) TO authenticated;",
    ]);
    expect(FUNCTION_EXECUTE_AUDIT_SQL).toContain("EXECUTE");
    expect(FUNCTION_EXECUTE_AUDIT_SQL).toContain("anon");
    expect(FUNCTION_EXECUTE_AUDIT_SQL).toContain("authenticated");
  });

  it("rejects an artifact that has no GRANT or REVOKE", () => {
    expect(() => assertPrivilegeArtifact("-- schema only\nCREATE TABLE public.farms (id uuid);\n")).toThrow(/GRANT or REVOKE/);
    expect(() => assertPrivilegeArtifact("-- GRANT SELECT ON TABLE public.farms TO authenticated;\n")).toThrow(/GRANT or REVOKE/);
    expect(() => extractPrivilegeStatements("CREATE TABLE public.farms (id uuid);\n")).toThrow(/no GRANT\/REVOKE/);
  });
});
