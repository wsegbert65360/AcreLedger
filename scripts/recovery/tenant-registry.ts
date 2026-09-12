export type OwnershipKind =
  | "root"
  | "direct"
  | "user"
  | "indirect"
  | "global"
  | "derived";

export interface TenantTable {
  schema: string;
  table: string;
  ownership: OwnershipKind;
  farmColumn?: string;
  userColumn?: string;
  via?: {
    schema: string;
    table: string;
    localColumn: string;
    parentColumn: string;
    parentFarmColumn?: string;
  };
  hasDeletedAt: boolean;
  restoreOrder: number;
  primaryKeys: string[];
  conflictKeys?: string[];
  includeInTenantBundle: boolean;
  notes: string;
}

export const TENANT_REGISTRY_VERSION = 1;

export const TENANT_REGISTRY: TenantTable[] = [
  {
    schema: "public",
    table: "farms",
    ownership: "root",
    farmColumn: "id",
    hasDeletedAt: true,
    restoreOrder: 10,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Authoritative tenant key. public.farms.id is farm_id everywhere else.",
  },
  {
    schema: "public",
    table: "profiles",
    ownership: "user",
    farmColumn: "farm_id",
    userColumn: "id",
    hasDeletedAt: false,
    restoreOrder: 20,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Security boundary. Maps auth.users.id to farm_id. Selective recovery must not reassign another farm's profile.",
  },
  {
    schema: "public",
    table: "fields",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 30,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Farm-owned field rows, including soft-deleted tombstones.",
  },
  {
    schema: "public",
    table: "bins",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 30,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Grain bins. Inventory is season-independent physical state.",
  },
  {
    schema: "public",
    table: "saved_seeds",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 30,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "User-managed seed reference data.",
  },
  {
    schema: "public",
    table: "fertilizer_recipes",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 30,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "User-managed fertilizer recipes.",
  },
  {
    schema: "public",
    table: "spray_recipes",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 30,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "User-managed spray recipes.",
  },
  {
    schema: "public",
    table: "fsa_tract_imports",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 30,
    primaryKeys: ["id"],
    conflictKeys: ["farm_id", "tract_key"],
    includeInTenantBundle: true,
    notes: "Restore with upsert on (farm_id, tract_key). Do not convert to a plain insert.",
  },
  {
    schema: "public",
    table: "farm_subscriptions",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 30,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Stripe entitlement mirror. Recreate billing in Stripe separately; do not copy live webhook secrets.",
  },
  {
    schema: "public",
    table: "field_clu_assignments",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    conflictKeys: ["farm_id", "tract_key", "clu_number"],
    includeInTenantBundle: true,
    notes: "Restore with upsert on (farm_id, tract_key, clu_number).",
  },
  {
    schema: "public",
    table: "plant_records",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Planting records, including FSA status fields.",
  },
  {
    schema: "public",
    table: "spray_records",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Compliance spray logs. Owner backup keeps embedded base64 attachments.",
  },
  {
    schema: "public",
    table: "custom_spray_records",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Outside-party spray log, not the compliance spray record.",
  },
  {
    schema: "public",
    table: "fertilizer_applications",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Fertilizer applications.",
  },
  {
    schema: "public",
    table: "tillage_records",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Tillage records.",
  },
  {
    schema: "public",
    table: "harvest_records",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Grain harvests. Linked grain movements restore after this table.",
  },
  {
    schema: "public",
    table: "hay_harvest_records",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Hay harvests.",
  },
  {
    schema: "public",
    table: "work_requests",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 40,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Outbound applicator work requests.",
  },
  {
    schema: "public",
    table: "grain_movements",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: true,
    restoreOrder: 50,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Preserve version and harvest_record_id. Negative bushels are valid corrections.",
  },
  {
    schema: "public",
    table: "farm_rainfall_daily",
    ownership: "direct",
    farmColumn: "farm_id",
    hasDeletedAt: false,
    restoreOrder: 50,
    primaryKeys: ["farm_id", "date_local"],
    includeInTenantBundle: true,
    notes: "Derived farm rainfall totals. May be restored or recomputed from hourly rows.",
  },
  {
    schema: "public",
    table: "field_rainfall_hourly",
    ownership: "indirect",
    via: {
      schema: "public",
      table: "fields",
      localColumn: "field_id",
      parentColumn: "id",
      parentFarmColumn: "farm_id",
    },
    hasDeletedAt: false,
    restoreOrder: 50,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Hourly radar rainfall. Owned through fields.field_id.",
  },
  {
    schema: "public",
    table: "field_rainfall_coverage",
    ownership: "indirect",
    via: {
      schema: "public",
      table: "fields",
      localColumn: "field_id",
      parentColumn: "id",
      parentFarmColumn: "farm_id",
    },
    hasDeletedAt: false,
    restoreOrder: 50,
    primaryKeys: ["field_id", "range_start_utc"],
    includeInTenantBundle: true,
    notes: "Rainfall coverage ranges owned through fields.",
  },
  {
    schema: "public",
    table: "field_rainfall_daily",
    ownership: "indirect",
    via: {
      schema: "public",
      table: "fields",
      localColumn: "field_id",
      parentColumn: "id",
      parentFarmColumn: "farm_id",
    },
    hasDeletedAt: false,
    restoreOrder: 50,
    primaryKeys: ["field_id", "date_local"],
    includeInTenantBundle: true,
    notes: "Legacy per-field daily rainfall if the table still exists.",
  },
  {
    schema: "public",
    table: "account_deletion_requests",
    ownership: "user",
    farmColumn: "farm_id",
    userColumn: "user_id",
    hasDeletedAt: false,
    restoreOrder: 60,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Owned by the farm user. Do not restore another user's deletion request.",
  },
  {
    schema: "ai_assistant_private",
    table: "rate_limits",
    ownership: "user",
    userColumn: "user_id",
    hasDeletedAt: false,
    restoreOrder: 70,
    primaryKeys: ["user_id"],
    includeInTenantBundle: true,
    notes: "Ask-the-book quota. Restore only for the farm's user IDs.",
  },
  {
    schema: "ai_assistant_private",
    table: "turns",
    ownership: "user",
    farmColumn: "farm_id",
    userColumn: "user_id",
    hasDeletedAt: false,
    restoreOrder: 70,
    primaryKeys: ["id"],
    includeInTenantBundle: true,
    notes: "Ask-the-book audit turns. Filter by farm_id when present, otherwise by the farm's user IDs.",
  },
  {
    schema: "weather_proxy_private",
    table: "rate_limits",
    ownership: "user",
    userColumn: "user_id",
    hasDeletedAt: false,
    restoreOrder: 70,
    primaryKeys: ["user_id"],
    includeInTenantBundle: true,
    notes: "Weather-proxy quota. Restore only for the farm's user IDs.",
  },
  {
    schema: "public",
    table: "billing_webhook_events",
    ownership: "global",
    hasDeletedAt: false,
    restoreOrder: 0,
    primaryKeys: ["stripe_event_id"],
    includeInTenantBundle: false,
    notes: "Stripe webhook idempotency ledger. Global infrastructure; never include in a single-farm bundle.",
  },
  {
    schema: "public",
    table: "rainfall_settings",
    ownership: "global",
    hasDeletedAt: false,
    restoreOrder: 0,
    primaryKeys: ["key"],
    includeInTenantBundle: false,
    notes: "Legacy key/value rainfall settings, not farm-scoped.",
  },
  {
    schema: "auth",
    table: "users",
    ownership: "user",
    userColumn: "id",
    hasDeletedAt: false,
    restoreOrder: 5,
    primaryKeys: ["id"],
    includeInTenantBundle: false,
    notes: "Included in the full-project dump. Selective recovery reports associated users but does not insert auth.users into production.",
  },
  {
    schema: "auth",
    table: "identities",
    ownership: "user",
    userColumn: "user_id",
    hasDeletedAt: false,
    restoreOrder: 6,
    primaryKeys: ["id"],
    includeInTenantBundle: false,
    notes: "Full-project recovery only. Selective recovery never restores identities into live Auth.",
  },
  {
    schema: "auth",
    table: "sessions",
    ownership: "global",
    hasDeletedAt: false,
    restoreOrder: 0,
    primaryKeys: ["id"],
    includeInTenantBundle: false,
    notes: "Never restore sessions during selective recovery.",
  },
  {
    schema: "auth",
    table: "refresh_tokens",
    ownership: "global",
    hasDeletedAt: false,
    restoreOrder: 0,
    primaryKeys: ["token"],
    includeInTenantBundle: false,
    notes: "Never restore refresh tokens during selective recovery.",
  },
  {
    schema: "storage",
    table: "buckets",
    ownership: "global",
    hasDeletedAt: false,
    restoreOrder: 0,
    primaryKeys: ["id"],
    includeInTenantBundle: false,
    notes: "Bucket configuration is global. Recreate buckets on full-project recovery.",
  },
  {
    schema: "storage",
    table: "objects",
    ownership: "global",
    hasDeletedAt: false,
    restoreOrder: 0,
    primaryKeys: ["id"],
    includeInTenantBundle: false,
    notes: "Attribute objects to a farm only when the key or metadata is unambiguous. Otherwise list for manual review.",
  },
  {
    schema: "supabase_migrations",
    table: "schema_migrations",
    ownership: "global",
    hasDeletedAt: false,
    restoreOrder: 0,
    primaryKeys: ["version"],
    includeInTenantBundle: false,
    notes: "Platform migration history. Restore separately during full-project recovery.",
  },
];

export function registryKey(entry: TenantTable): string {
  return `${entry.schema}.${entry.table}`;
}

export function tenantBundleTables(): TenantTable[] {
  return TENANT_REGISTRY.filter((entry) => entry.includeInTenantBundle)
    .slice()
    .sort((a, b) => a.restoreOrder - b.restoreOrder || registryKey(a).localeCompare(registryKey(b)));
}

export function extractSql(entry: TenantTable): { sql: string; params: "farm" | "farm+users" | "users" } {
  const qualified = `"${entry.schema}"."${entry.table}"`;
  if (entry.ownership === "root") {
    return { sql: `SELECT * FROM ${qualified} WHERE id = $1`, params: "farm" };
  }
  if (entry.ownership === "direct" && entry.farmColumn) {
    return { sql: `SELECT * FROM ${qualified} WHERE "${entry.farmColumn}" = $1`, params: "farm" };
  }
  if (entry.ownership === "indirect" && entry.via) {
    const parent = `"${entry.via.schema}"."${entry.via.table}"`;
    const parentFarm = entry.via.parentFarmColumn ?? "farm_id";
    return {
      sql: `SELECT t.* FROM ${qualified} t JOIN ${parent} p ON p."${entry.via.parentColumn}" = t."${entry.via.localColumn}" WHERE p."${parentFarm}" = $1`,
      params: "farm",
    };
  }
  if (entry.ownership === "user" && entry.farmColumn && entry.userColumn) {
    return {
      sql: `SELECT * FROM ${qualified} WHERE "${entry.farmColumn}" = $1 AND "${entry.userColumn}" = ANY($2::uuid[])`,
      params: "farm+users",
    };
  }
  if (entry.ownership === "user" && entry.userColumn) {
    return {
      sql: `SELECT * FROM ${qualified} WHERE "${entry.userColumn}" = ANY($1::uuid[])`,
      params: "users",
    };
  }
  throw new Error(`No extract SQL for ${registryKey(entry)}`);
}

export function assertFarmScopedWrite(sql: string): void {
  const normalized = sql.replace(/\s+/g, " ").toLowerCase().replace(/"/g, "");
  if (/\bdelete from\b/.test(normalized)) {
    throw new Error("Hard DELETE is forbidden during tenant recovery.");
  }
  const hasFarm =
    normalized.includes("farm_id") ||
    normalized.includes("where id = $1") ||
    normalized.includes("= any($") ||
    normalized.includes("(row_data->>'id')::uuid = $2");
  if (!hasFarm) {
    throw new Error("Refusing unscoped write SQL.");
  }
}
