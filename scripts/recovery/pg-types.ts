import { Client, types } from "pg";

/** PostgreSQL date (no time). Keep as text so TZ does not shift the calendar day. */
export const PG_DATE_OID = 1082;
/** timestamp without time zone */
export const PG_TIMESTAMP_OID = 1114;
/** timestamptz */
export const PG_TIMESTAMPTZ_OID = 1184;

let configured = false;

/** Parse date/timestamp OIDs as text so recovery dumps round-trip the stored values. */
export function configureRecoveryPgTypes(): void {
  types.setTypeParser(PG_DATE_OID, (value) => value);
  types.setTypeParser(PG_TIMESTAMP_OID, (value) => value);
  types.setTypeParser(PG_TIMESTAMPTZ_OID, (value) => value);
  configured = true;
}

export function createRecoveryClient(databaseUrl: string): Client {
  configureRecoveryPgTypes();
  return new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true },
  });
}

export function recoveryPgTypesConfigured(): boolean {
  return configured;
}
