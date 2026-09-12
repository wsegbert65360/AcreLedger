import { Client } from "pg";
import type { BackupConfig } from "./config.js";

const LOCK_NAME = "acreledger-owner-backup";

export async function acquireDatabaseExecutionLock(config: BackupConfig): Promise<() => Promise<void>> {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: config.sslRejectUnauthorized },
  });
  await client.connect();
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [LOCK_NAME],
    );
    if (result.rows[0]?.locked !== true) {
      throw new Error("Another backup execution holds the database lock.");
    }
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [LOCK_NAME]);
    } finally {
      await client.end();
    }
  };
}
