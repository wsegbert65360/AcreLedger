import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTlsDatabaseUrl } from "../../infrastructure/owner-backup/src/config.js";
import { createRecoveryClient } from "./pg-types.js";
import { assertTenantBundleChecksum, tenantBundleChecksum, type TenantBundle } from "./extract-tenant.js";
import { tenantBundleTables, userIdColumns } from "./tenant-registry.js";

export interface AuthRecoveryClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rowCount: number | null; rows: T[] }>;
}

export function remapBundleUser(bundle: TenantBundle, oldUserId: string, newUserId: string): TenantBundle {
  assertTenantBundleChecksum(bundle);
  if (!bundle.profileIds.includes(oldUserId)) throw new Error("Old user ID is not part of this farm bundle.");
  const remapped: TenantBundle = structuredClone(bundle);
  remapped.profileIds = remapped.profileIds.map((id) => id === oldUserId ? newUserId : id);
  for (const entry of tenantBundleTables()) {
    const columns = userIdColumns(entry);
    if (columns.length === 0) continue;
    const key = `${entry.schema}.${entry.table}`;
    remapped.tables[key] = (remapped.tables[key] ?? []).map((value) => {
      const row = { ...(value as Record<string, unknown>) };
      for (const column of columns) {
        if (row[column] === oldUserId) row[column] = newUserId;
      }
      return row;
    });
  }
  remapped.checksums = {};
  remapped.checksums["bundle.json"] = tenantBundleChecksum(remapped);
  return remapped;
}

async function inviteUser(projectUrl: string, serviceRoleKey: string, email: string): Promise<string> {
  const response = await fetch(`${projectUrl.replace(/\/$/, "")}/auth/v1/invite`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(`Supabase Auth invite failed with HTTP ${response.status}.`);
  const body = await response.json() as { id?: string; user?: { id?: string } };
  const id = body.id ?? body.user?.id;
  if (!id) throw new Error("Supabase Auth invite did not return a user ID.");
  return id;
}

async function deleteInvitedUser(projectUrl: string, serviceRoleKey: string, userId: string): Promise<void> {
  const response = await fetch(
    `${projectUrl.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}?should_soft_delete=false`,
    {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Compensating Auth user deletion failed with HTTP ${response.status}.`);
  }
}

async function assertGeneratedFarmEmpty(client: AuthRecoveryClient, generatedFarmId: string): Promise<void> {
  for (const entry of tenantBundleTables()) {
    if (entry.farmColumn !== "farm_id" || entry.table === "profiles") continue;
    const count = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${entry.schema}"."${entry.table}" WHERE farm_id = $1`,
      [generatedFarmId],
    );
    if (Number(count.rows[0]?.count ?? "0") > 0) {
      throw new Error("The invited user already has data in its generated farm; refusing automatic reassignment.");
    }
  }
}

export async function attachInvitedProfile(
  client: AuthRecoveryClient,
  oldUserId: string,
  newUserId: string,
  farmId: string,
): Promise<void> {
  if (oldUserId === newUserId) throw new Error("Supabase Auth returned the deleted user's old ID unexpectedly.");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [farmId]);
    const oldProfile = await client.query<{ farm_id: string }>(
      "SELECT farm_id FROM public.profiles WHERE id = $1 FOR UPDATE",
      [oldUserId],
    );
    const newProfile = await client.query<{ farm_id: string }>(
      "SELECT farm_id FROM public.profiles WHERE id = $1 FOR UPDATE",
      [newUserId],
    );
    const generatedFarmId = newProfile.rows[0]?.farm_id;
    if (generatedFarmId && generatedFarmId !== farmId) {
      await assertGeneratedFarmEmpty(client, generatedFarmId);
    }

    if (oldProfile.rowCount === 1) {
      if (oldProfile.rows[0]?.farm_id !== farmId) {
        throw new Error("The surviving old profile belongs to a different farm.");
      }
      if (newProfile.rowCount === 1) {
        // This is only the empty profile created by the invite trigger. Removing it
        // frees the new Auth ID so the surviving customer profile can be remounted.
        const removed = await client.query(
          "DELETE FROM public.profiles WHERE id = $1 AND farm_id = $2",
          [newUserId, generatedFarmId],
        );
        if (removed.rowCount !== 1) throw new Error("The generated invite profile changed during recovery.");
      }
      const remounted = await client.query(
        "UPDATE public.profiles SET id = $1 WHERE id = $2 AND farm_id = $3",
        [newUserId, oldUserId, farmId],
      );
      if (remounted.rowCount !== 1) throw new Error("The surviving profile could not be remounted to the invited Auth user.");
    } else {
      if (newProfile.rowCount !== 1 || !generatedFarmId) {
        throw new Error("The Auth invite did not create a profile to attach.");
      }
      if (generatedFarmId !== farmId) {
        const attached = await client.query(
          "UPDATE public.profiles SET farm_id = $1 WHERE id = $2 AND farm_id = $3",
          [farmId, newUserId, generatedFarmId],
        );
        if (attached.rowCount !== 1) throw new Error("The generated invite profile changed during recovery.");
      }
    }

    if (generatedFarmId && generatedFarmId !== farmId) {
      await client.query("UPDATE public.farms SET deleted_at = coalesce(deleted_at, now()) WHERE id = $1", [generatedFarmId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function validateAuthRecoveryPreconditions(options: {
  bundle: TenantBundle;
  farmId: string;
  oldUserId: string;
  email: string;
  client: AuthRecoveryClient;
}): Promise<{ farmId: string; oldUserId: string; email: string }> {
  assertTenantBundleChecksum(options.bundle);
  if (options.bundle.farmId !== options.farmId) throw new Error("Bundle farm does not match the requested farm.");
  if (!options.bundle.profileIds.includes(options.oldUserId)) throw new Error("Old user ID is not part of this farm bundle.");
  if (!options.email.includes("@")) throw new Error("A valid email is required.");
  const farm = await options.client.query("SELECT id FROM public.farms WHERE id = $1", [options.farmId]);
  if (farm.rowCount !== 1) throw new Error("Farm not found.");
  const profile = await options.client.query(
    "SELECT id, farm_id FROM public.profiles WHERE id = $1",
    [options.oldUserId],
  );
  if (profile.rowCount === 1 && String(profile.rows[0]?.farm_id) !== options.farmId) {
    throw new Error("The surviving old profile belongs to a different farm.");
  }
  const existing = await options.client.query(
    "SELECT id FROM auth.users WHERE email = $1",
    [options.email],
  );
  if ((existing.rowCount ?? 0) > 0) throw new Error("That email is already in use.");
  return { farmId: options.farmId, oldUserId: options.oldUserId, email: options.email };
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const databaseUrl = process.env.RECOVERY_DATABASE_URL ?? "";
    const projectUrl = process.env.RECOVERY_SUPABASE_URL ?? "";
    const serviceRoleKey = process.env.RECOVERY_SERVICE_ROLE_KEY ?? "";
    const bundlePath = arg("--bundle") ?? "";
    const outputPath = arg("--output") ?? "";
    const farmId = arg("--farm-id") ?? "";
    const oldUserId = arg("--old-user-id") ?? "";
    const email = arg("--email") ?? "";
    const execute = process.argv.includes("--execute");
    if (arg("--confirm") !== `RECREATE-DELETED-USER:${farmId}:${oldUserId}`) throw new Error("Typed Auth recovery confirmation does not match.");
    if (!process.argv.includes("--pre-backup-verified")) throw new Error("A verified pre-recovery backup is required.");
    assertTlsDatabaseUrl(databaseUrl);
    const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8")) as TenantBundle;
    const client = createRecoveryClient(databaseUrl);
    await client.connect();
    try {
      await validateAuthRecoveryPreconditions({ bundle, farmId, oldUserId, email, client });
      if (!execute) {
        console.log(JSON.stringify({
          status: "dry-run",
          farmId,
          oldUserId,
          email,
          invited: false,
          detail: "Preconditions passed. Re-run with --execute to invite the Auth user.",
        }));
        return;
      }
      if (!projectUrl.startsWith("https://") || !serviceRoleKey || !outputPath) {
        throw new Error("HTTPS project URL, service-role key, and output path are required.");
      }
      let newUserId: string | undefined;
      let wroteOutput = false;
      let attached = false;
      try {
        newUserId = await inviteUser(projectUrl, serviceRoleKey, email);
        const remapped = remapBundleUser(bundle, oldUserId, newUserId);
        await fs.writeFile(outputPath, `${JSON.stringify(remapped, null, 2)}\n`, { flag: "wx" });
        wroteOutput = true;
        await attachInvitedProfile(client, oldUserId, newUserId, farmId);
        attached = true;
        console.log(JSON.stringify({ status: "ok", farmId, oldUserId, newUserId, outputPath }));
      } catch (error) {
        if (!attached && newUserId) {
          let cleanupError: unknown;
          try {
            await deleteInvitedUser(projectUrl, serviceRoleKey, newUserId);
          } catch (caught) {
            cleanupError = caught;
          }
          if (wroteOutput) await fs.rm(outputPath, { force: true });
          if (cleanupError) throw new Error(`${String(error)} ${String(cleanupError)}`);
        }
        throw error;
      }
    } finally {
      await client.end();
    }
  })().catch((error) => {
    console.error(JSON.stringify({ status: "failed", detail: String(error) }));
    process.exitCode = 1;
  });
}
